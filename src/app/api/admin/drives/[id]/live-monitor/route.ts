import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { toCamelCase } from "@/lib/caseConvert";

// Backs the unified admin/control-center "Live Monitoring" page. Replaces
// having to visit two separate pages (Control Center for activity/stage/
// cheat-warnings, Proctoring Overview for webcam flags/snapshots) to get
// the full picture of one candidate -- and, unlike either of those, this
// includes candidates who are still mid-exam (stage never leaves
// EXAM_PENDING until final submit), not just ones who've already finished.
//
// Three flat queries, no N+1: candidates for the drive, their exam_sessions
// (status/start_time/deadline), and their proctoring_events aggregated by
// type + latest timestamp.
const CANDIDATE_COLUMNS =
  "id,name,email,college_roll_number,stage,exam_score,cheat_warnings,last_active_at,last_reset_at";

const ACTIVE_WINDOW_MS = 120_000; // matches the existing convention (control-center, exam-login concurrency lock)

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: driveId } = await context.params;

    const { data: candidates, error: candidatesError } = await supabase
      .from("candidates")
      .select(CANDIDATE_COLUMNS)
      .eq("drive_id", driveId)
      .order("exam_score", { ascending: false });
    if (candidatesError) throw candidatesError;

    const candidateIds = (candidates || []).map((c) => c.id);

    // Most-recent exam_sessions row per candidate. In current schema a
    // candidate has at most one at a time (a re-attempt hard-deletes prior
    // rows), but defensively pick the latest by start_time if that ever
    // changes.
    const sessionByCandidateId: Record<string, { status: string; start_time: string; deadline: string | null }> = {};
    if (candidateIds.length > 0) {
      const { data: sessions, error: sessionsError } = await supabase
        .from("exam_sessions")
        .select("candidate_id,status,start_time,deadline")
        .in("candidate_id", candidateIds)
        .order("start_time", { ascending: false });
      if (sessionsError) throw sessionsError;
      for (const s of sessions || []) {
        if (!sessionByCandidateId[s.candidate_id]) {
          sessionByCandidateId[s.candidate_id] = s;
        }
      }
    }

    // Proctoring flag counts + latest snapshot timestamp per candidate.
    const proctoringByCandidateId: Record<
      string,
      { snapshotCount: number; noFace: number; multipleFaces: number; lookingAway: number; highNoise: number; latestSnapshotAt: string | null }
    > = {};
    for (const id of candidateIds) {
      proctoringByCandidateId[id] = { snapshotCount: 0, noFace: 0, multipleFaces: 0, lookingAway: 0, highNoise: 0, latestSnapshotAt: null };
    }
    if (candidateIds.length > 0) {
      const { data: events, error: eventsError } = await supabase
        .from("proctoring_events")
        .select("candidate_id,event_type,created_at")
        .in("candidate_id", candidateIds);
      if (eventsError) throw eventsError;

      for (const e of events || []) {
        const bucket = proctoringByCandidateId[e.candidate_id];
        if (!bucket) continue;
        bucket.snapshotCount += 1;
        if (e.event_type === "NO_FACE") bucket.noFace += 1;
        else if (e.event_type === "MULTIPLE_FACES") bucket.multipleFaces += 1;
        else if (e.event_type === "LOOKING_AWAY") bucket.lookingAway += 1;
        else if (e.event_type === "HIGH_NOISE") bucket.highNoise += 1;
        if (!bucket.latestSnapshotAt || e.created_at > bucket.latestSnapshotAt) {
          bucket.latestSnapshotAt = e.created_at;
        }
      }
    }

    const now = Date.now();
    const roster = (candidates || []).map((c) => {
      const session = sessionByCandidateId[c.id] || null;
      const isActiveNow = !!c.last_active_at && now - new Date(c.last_active_at).getTime() < ACTIVE_WINDOW_MS;

      const writingStatus: "WRITING" | "COMPLETED" | "NOT_STARTED" =
        c.stage !== "EXAM_PENDING" ? "COMPLETED" : session?.status === "IN_PROGRESS" ? "WRITING" : "NOT_STARTED";

      return {
        ...c,
        is_active_now: isActiveNow,
        session_status: session?.status ?? null,
        session_start_time: session?.start_time ?? null,
        session_deadline: session?.deadline ?? null,
        writing_status: writingStatus,
        ...proctoringByCandidateId[c.id],
      };
    });

    return NextResponse.json({ success: true, candidates: toCamelCase(roster) }, { status: 200 });
  } catch (error: any) {
    console.error("Live Monitor Aggregation Failure:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
