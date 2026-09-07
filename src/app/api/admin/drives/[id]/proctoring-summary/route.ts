import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { toCamelCase } from "@/lib/caseConvert";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const unauthorized = await requireAdmin();
    if (unauthorized) return unauthorized;

    const { id: driveId } = await context.params;

    const { data: candidates, error: candidatesError } = await supabase
      .from("candidates")
      .select("id,name,email,college_roll_number")
      .eq("drive_id", driveId);
    if (candidatesError) throw candidatesError;

    // Per-candidate counts, not a signed-URL gallery -- this powers the
    // drive-wide roster, which would otherwise need hundreds of signed URLs
    // generated up front just to show counts. Full galleries are fetched
    // lazily per candidate via /api/admin/candidates/[id]/proctoring.
    const candidateIds = (candidates || []).map((c) => c.id);
    const countsByCandidateId: Record<string, { snapshotCount: number; noFace: number; multipleFaces: number; lookingAway: number; highNoise: number }> = {};
    for (const id of candidateIds) {
      countsByCandidateId[id] = { snapshotCount: 0, noFace: 0, multipleFaces: 0, lookingAway: 0, highNoise: 0 };
    }

    if (candidateIds.length > 0) {
      const { data: events, error: eventsError } = await supabase
        .from("proctoring_events")
        .select("candidate_id,event_type")
        .in("candidate_id", candidateIds);
      if (eventsError) throw eventsError;

      for (const e of events || []) {
        const bucket = countsByCandidateId[e.candidate_id];
        if (!bucket) continue;
        bucket.snapshotCount += 1;
        if (e.event_type === "NO_FACE") bucket.noFace += 1;
        else if (e.event_type === "MULTIPLE_FACES") bucket.multipleFaces += 1;
        else if (e.event_type === "LOOKING_AWAY") bucket.lookingAway += 1;
        else if (e.event_type === "HIGH_NOISE") bucket.highNoise += 1;
      }
    }

    const roster = (candidates || []).map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      college_roll_number: c.college_roll_number,
      ...countsByCandidateId[c.id],
    }));

    return NextResponse.json({ success: true, candidates: toCamelCase(roster) }, { status: 200 });
  } catch (error: any) {
    console.error("Proctoring Summary Failure:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
