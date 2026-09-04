import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { toCamelCase } from "@/lib/caseConvert";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: candidateId } = await context.params;

    // 1. Fetch the Candidate
    const { data: candidate, error: candidateError } = await supabase
      .from("candidates")
      .select("id,name,exam_score,college_roll_number,drive_id")
      .eq("id", candidateId)
      .maybeSingle();
    if (candidateError) throw candidateError;
    if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

    // 2. Fetch the COMPLETED or TERMINATED session
    const { data: session, error: sessionError } = await supabase
      .from("exam_sessions")
      .select("*")
      .eq("candidate_id", candidateId)
      .in("status", ["COMPLETED", "TERMINATED"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sessionError) throw sessionError;

    if (!session) {
      return NextResponse.json({
        success: true,
        candidate: toCamelCase(candidate),
        report: null,
        message: "No completed exam session found for this candidate."
      });
    }

    // 3. Fetch ONLY relevant questions (those in the session or for the drive)
    let questionsQuery = supabase.from("questions").select("*");
    questionsQuery = (session.question_ids && session.question_ids.length > 0)
      ? questionsQuery.in("id", session.question_ids)
      : questionsQuery.eq("drive_id", candidate.drive_id);

    const { data: questions, error: questionsError } = await questionsQuery;
    if (questionsError) throw questionsError;

    // 4. Build the comparison report
    const responses = session.responses || {};
    const reportDetails = (questions || []).map((q: any) => {
      const resp = responses[q.id];
      let isCorrect = false;
      let candidateAnswer = "N/A";

      if (q.type === 'MCQ') {
        candidateAnswer = resp?.selectedOption || "No Answer";
        isCorrect = candidateAnswer === q.correct_answer;
      } else if (q.type === 'CODING') {
        candidateAnswer = resp?.codeStr || "No Code Submitted";
        // For coding, we rely on the pre-evaluated testsPassed from the session/responses metadata
        isCorrect = (resp?.testsPassed > 0 && resp?.testsPassed === resp?.totalTests);
      }

      return {
        _id: q.id,
        title: q.title,
        type: q.type,
        content: q.content,
        options: q.options,
        correctAnswer: q.correct_answer,
        candidateAnswer,
        isCorrect,
        codingMetadata: q.type === 'CODING' ? {
          testsPassed: resp?.testsPassed || 0,
          totalTests: resp?.totalTests || q.test_cases?.length || 0
        } : null
      };
    });

    const durationSeconds = Math.floor(
      (new Date(session.updated_at).getTime() - new Date(session.start_time).getTime()) / 1000
    );

    return NextResponse.json({
      success: true,
      candidate: toCamelCase(candidate),
      session: {
        startTime: session.start_time,
        endTime: session.updated_at,
        durationSeconds,
        status: session.status
      },
      report: reportDetails
    });

  } catch (error: any) {
    console.error("Exam Report Failure:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
