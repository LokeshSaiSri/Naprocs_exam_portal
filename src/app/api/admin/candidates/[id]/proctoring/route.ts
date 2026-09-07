import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { toCamelCase } from "@/lib/caseConvert";
import { purgeProctoringForCandidate } from "@/lib/proctoringPurge";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: candidateId } = await context.params;

    const { data: events, error } = await supabase
      .from("proctoring_events")
      .select("id,event_type,snapshot_path,created_at")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    // Batch-resolve every snapshot to a short-lived signed URL in one call,
    // same pattern as resume_url resolution in admin/candidates/route.ts --
    // a candidate can have dozens of snapshots, so one createSignedUrls call
    // beats one createSignedUrl per row.
    const paths = (events || []).map((e) => e.snapshot_path).filter(Boolean) as string[];
    const signedUrlByPath: Record<string, string> = {};
    if (paths.length > 0) {
      const { data: signedUrls, error: signError } = await supabase.storage
        .from("proctoring-snapshots")
        .createSignedUrls(paths, 3600); // 1 hour
      if (signError) throw signError;
      (signedUrls || []).forEach((s: any) => {
        if (s.signedUrl) signedUrlByPath[s.path] = s.signedUrl;
      });
    }

    const eventsWithUrls = (events || []).map((e) => ({
      ...e,
      snapshot_url: e.snapshot_path ? signedUrlByPath[e.snapshot_path] || null : null,
    }));

    return NextResponse.json({ success: true, events: toCamelCase(eventsWithUrls) }, { status: 200 });
  } catch (error: any) {
    console.error("Proctoring Gallery Fetch Failure:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: candidateId } = await context.params;
    const { purged } = await purgeProctoringForCandidate(candidateId);
    return NextResponse.json({ success: true, purged }, { status: 200 });
  } catch (error: any) {
    console.error("Proctoring Purge Failure:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
