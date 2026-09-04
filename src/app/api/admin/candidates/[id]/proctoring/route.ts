import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { toCamelCase } from "@/lib/caseConvert";

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

    const { data: events, error: lookupError } = await supabase
      .from("proctoring_events")
      .select("snapshot_path")
      .eq("candidate_id", candidateId);
    if (lookupError) throw lookupError;

    const paths = (events || []).map((e) => e.snapshot_path).filter(Boolean) as string[];
    if (paths.length > 0) {
      const { error: storageError } = await supabase.storage.from("proctoring-snapshots").remove(paths);
      if (storageError) throw storageError;
    }

    const { error: deleteError } = await supabase.from("proctoring_events").delete().eq("candidate_id", candidateId);
    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true, purged: paths.length }, { status: 200 });
  } catch (error: any) {
    console.error("Proctoring Purge Failure:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
