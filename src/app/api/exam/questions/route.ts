import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { toCamelCase } from "@/lib/caseConvert";
import { ensureSessionDeadline, sweepIfExpired } from "@/lib/examTiming";

// Rulebook rule #7: Mongo's { $sample: { size: n } } aggregation replaced with
// an in-app random sample. Question banks per drive are small (tens, not
// thousands), so fetch-all + shuffle is simpler than maintaining a Postgres
// RPC function for no real benefit at this scale, and this only runs once per
// candidate (session creation), not on the hot path.
function sampleRandom<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const candidateId = searchParams.get("candidateId");

    if (!candidateId) {
      return NextResponse.json({ error: "Candidate identity required for session initialization" }, { status: 400 });
    }

    // 1. Fetch Candidate & Drive
    const { data: candidate, error: candidateError } = await supabase
      .from("candidates").select("*").eq("id", candidateId).maybeSingle();
    if (candidateError) throw candidateError;
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const { data: drive, error: driveError } = await supabase
      .from("drives").select("*").eq("id", candidate.drive_id).maybeSingle();
    if (driveError) throw driveError;
    if (!drive) {
      return NextResponse.json({ error: "Associated recruitment drive not found" }, { status: 404 });
    }

    // 2. Initialize or Resume Exam Session
    const { data: existingSession, error: sessionLookupError } = await supabase
      .from("exam_sessions").select("*").eq("candidate_id", candidateId).eq("status", "IN_PROGRESS").maybeSingle();
    if (sessionLookupError) throw sessionLookupError;

    // Lazy-sweep: if this "in progress" session actually ran past its
    // deadline (browser was closed, tab was backgrounded and throttled past
    // the grace window, etc.), finalize it now rather than silently handing
    // the candidate a fresh full-duration attempt on reload. Re-attempts are
    // an explicit admin action (Live Monitoring "Re-attempt" button), never
    // an automatic side effect of refreshing a dead tab.
    if (existingSession) {
      const { swept } = await sweepIfExpired(existingSession);
      if (swept) {
        return NextResponse.json(
          { error: "Your exam session has expired.", expired: true },
          { status: 410 }
        );
      }
    }

    let session = existingSession;
    let questionsToDeliver: any[] = [];

    if (!session) {
      // 2.1 Get Global Defaults for Fallback
      const { data: globalSettings } = await supabase.from("settings").select("*").limit(1).maybeSingle();

      const mcqCount = drive.mcq_count || globalSettings?.mcq_count || 15;
      const codingCount = drive.coding_count || globalSettings?.coding_count || 2;

      // PERFORM RANDOM POOLING (First time session initialization)
      const { data: mcqPool, error: mcqPoolError } = await supabase
        .from("questions").select("*").eq("drive_id", drive.id).eq("type", "MCQ");
      if (mcqPoolError) throw mcqPoolError;

      const { data: codingPoolAll, error: codingPoolAllError } = await supabase
        .from("questions").select("*").eq("drive_id", drive.id).eq("type", "CODING");
      if (codingPoolAllError) throw codingPoolAllError;

      const poolMcqs = sampleRandom(mcqPool || [], mcqCount);
      const poolCoding = sampleRandom(codingPoolAll || [], codingCount);

      questionsToDeliver = [...poolMcqs, ...poolCoding];

      // Compute the authoritative deadline once, at creation, rather than
      // leaving the client to (re)derive it from the drive's shared
      // exam_end on every mount -- see src/lib/examTiming.ts.
      const startTime = new Date();
      const durationMs = (drive.exam_duration || 0) * 60_000;
      const driveEndMs = drive.exam_end ? new Date(drive.exam_end).getTime() : Infinity;
      const deadline = new Date(Math.min(startTime.getTime() + durationMs, driveEndMs));

      // Store the specific IDs in the session so they don't change on refresh
      const { data: newSession, error: createSessionError } = await supabase
        .from("exam_sessions")
        .insert({
          candidate_id: candidateId,
          status: "IN_PROGRESS",
          start_time: startTime.toISOString(),
          deadline: deadline.toISOString(),
          responses: {},
          question_ids: questionsToDeliver.map((q) => q.id),
        })
        .select()
        .single();
      if (createSessionError) throw createSessionError;
      session = newSession;
    } else {
      // Self-heal: legacy sessions created before the `deadline` column
      // existed won't have one yet -- compute and persist it now so the
      // client always gets an authoritative value to seed its countdown
      // from, on this load and every future one.
      await ensureSessionDeadline(session, drive);

      // RESUME: Fetch the exact questions already picked for this student
      const pickedIds: string[] = session.question_ids || [];

      if (pickedIds.length > 0) {
        const { data: pickedQuestions, error: pickedError } = await supabase
          .from("questions").select("*").in("id", pickedIds);
        if (pickedError) throw pickedError;
        questionsToDeliver = pickedQuestions || [];

        // SESSION REPAIR (Self-Healing):
        // If the session is at MCQ stage or just transitioned to CODING, check if it's missing
        // coding questions but the drive configuration expects them.
        const hasCoding = questionsToDeliver.some((q) => q.type === "CODING");
        const expectedCoding = drive.coding_count || 0;

        if (!hasCoding && expectedCoding > 0) {
          console.log(`Self-Healing: Pooling missing coding questions for session ${session.id}`);
          const { data: codingPool, error: codingPoolError } = await supabase
            .from("questions").select("*").eq("drive_id", drive.id).eq("type", "CODING");
          if (codingPoolError) throw codingPoolError;

          const poolCoding = sampleRandom(codingPool || [], expectedCoding);

          if (poolCoding.length > 0) {
            const newIds = poolCoding.map((q) => q.id);
            // Update database session so it persists for future reloads
            const { error: updateError } = await supabase
              .from("exam_sessions")
              .update({ question_ids: [...pickedIds, ...newIds] })
              .eq("id", session.id);
            if (updateError) throw updateError;
            // Append to current delivery
            questionsToDeliver = [...questionsToDeliver, ...poolCoding];
          }
        }
      } else {
        // Fallback for legacy sessions: Assign all current drive questions
        const { data: allQuestions, error: allError } = await supabase
          .from("questions").select("*").eq("drive_id", drive.id);
        if (allError) throw allError;
        questionsToDeliver = allQuestions || [];

        // Update session with these IDs to "lock" them now
        const { error: updateError } = await supabase
          .from("exam_sessions")
          .update({ question_ids: questionsToDeliver.map((q) => q.id) })
          .eq("id", session.id);
        if (updateError) throw updateError;
      }
    }

    // 3. Mapping payload for the client (Removing Correct Answers + Hashing Hidden Tests)
    const sanitizedQuestions = questionsToDeliver.map((qRow: any) => {
      const safeQuestion: any = toCamelCase(qRow);

      // If MCQ: Scrub the Correct Answer
      if (safeQuestion.type === 'MCQ') {
        delete safeQuestion.correctAnswer;
      }

      // If Coding: Handle the TestCases
      if (safeQuestion.type === 'CODING' && Array.isArray(safeQuestion.testCases)) {
        safeQuestion.testCases = safeQuestion.testCases.map((tc: any) => {
          if (tc.isHidden) {
            return { ...tc, expectedOutput: "[ PRIVATE TEST CASE ]" };
          }
          return tc;
        });
      }

      return safeQuestion;
    });

    // 4. Resolve Settings Hierarchy: Drive > Global Defaults
    const { data: globalSettingsForMerge } = await supabase.from("settings").select("*").limit(1).maybeSingle();
    const driveObj = toCamelCase(drive);

    // Merge logic: If drive has these proctoring fields, they override global.
    // Otherwise fallback to global or model defaults.
    const resolvedSettings = {
      ...driveObj,
      maxCheatWarnings: drive.max_cheat_warnings ?? globalSettingsForMerge?.max_cheat_warnings ?? 3,
      proctoringSeverity: drive.proctoring_severity ?? globalSettingsForMerge?.proctoring_sensitivity ?? 'MEDIUM'
    };

    return NextResponse.json({
      success: true,
      questions: sanitizedQuestions,
      settings: resolvedSettings, // Return merged settings for frontend consumption
      sessionId: session.id,
      currentStage: session.current_stage || 'MCQ',
      existingResponses: session.responses || {},
      deadline: session.deadline
    }, { status: 200 });

  } catch (error: any) {
    console.error("Exam Fetch Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
