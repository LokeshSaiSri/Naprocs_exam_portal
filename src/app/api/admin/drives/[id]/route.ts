import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { toCamelCase, toSnakeCase } from "@/lib/caseConvert";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const unauthorized = await requireAdmin();
    if (unauthorized) return unauthorized;

    const { id } = await params;
    const { data: drive, error } = await supabase.from("drives").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!drive) return NextResponse.json({ error: "Drive not found" }, { status: 404 });
    return NextResponse.json({ success: true, drive: toCamelCase(drive) });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch drive" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const unauthorized = await requireAdmin();
    if (unauthorized) return unauthorized;

    const { id } = await params;
    const body = await req.json();
    // NOTE: original route never checked for a not-found id here (findByIdAndUpdate
    // silently returns null); preserved as-is -- drive comes back null in that case.
    const { data: drive, error } = await supabase
      .from("drives")
      .update(toSnakeCase(body))
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ success: true, drive: drive ? toCamelCase(drive) : null });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update drive" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const unauthorized = await requireAdmin();
    if (unauthorized) return unauthorized;

    // THE "PURGE" FEATURE: Delete Drive, associated Candidates, and associated Questions.
    // Sequential, non-transactional -- matches original Mongoose behavior exactly
    // (Rulebook rule #10: not changing this without explicit sign-off).
    // NOTE: `candidates` and `questions` tables don't exist yet (Steps 3-4) --
    // this will fail until then. Written now so Drive's route set is complete.
    const { id: driveId } = await params;

    // 0. Delete exam sessions belonging to this drive's candidates.
    // The original Mongo cascade never touched ExamSession -- Mongo has no FK
    // enforcement, so orphaned sessions were silently left behind. Postgres
    // has a real foreign key (exam_sessions.candidate_id -> candidates.id),
    // so deleting a candidate with sessions still attached would now fail
    // outright instead of silently leaving orphans. That's a regression
    // against the *intent* of "purge everything successfully," not a
    // Part-4-worthy behavior choice -- fixing it so the purge actually works.
    const { data: driveCandidates, error: candLookupError } = await supabase
      .from("candidates")
      .select("id,resume_url")
      .eq("drive_id", driveId);
    if (candLookupError) throw candLookupError;

    if (driveCandidates && driveCandidates.length > 0) {
      const candidateIds = driveCandidates.map((c) => c.id);

      // proctoring_events.session_id/candidate_id are NOT NULL FKs into
      // exam_sessions/candidates, so this must be purged before either of
      // those deletes below or the purge fails outright partway through.
      const { data: proctoringEvents, error: proctoringLookupError } = await supabase
        .from("proctoring_events")
        .select("snapshot_path")
        .in("candidate_id", candidateIds);
      if (proctoringLookupError) throw proctoringLookupError;

      const snapshotPaths = (proctoringEvents || []).map((e) => e.snapshot_path).filter(Boolean);
      if (snapshotPaths.length > 0) {
        const { error: snapshotStorageError } = await supabase.storage.from("proctoring-snapshots").remove(snapshotPaths);
        if (snapshotStorageError) throw snapshotStorageError;
      }

      const { error: proctoringEventsError } = await supabase.from("proctoring_events").delete().in("candidate_id", candidateIds);
      if (proctoringEventsError) throw proctoringEventsError;

      const { error: sessionsError } = await supabase.from("exam_sessions").delete().in("candidate_id", candidateIds);
      if (sessionsError) throw sessionsError;

      // Also purge resume files from Storage (Part 4 decision, 2026-09-01) --
      // "purge everything associated with this drive" should include the
      // actual resume PDFs, not just the DB rows that reference them.
      const resumePaths = driveCandidates.map((c) => c.resume_url).filter(Boolean);
      if (resumePaths.length > 0) {
        const { error: storageError } = await supabase.storage.from("resumes").remove(resumePaths);
        if (storageError) throw storageError;
      }
    }

    // 1. Delete Candidates
    const { error: candidatesError } = await supabase.from("candidates").delete().eq("drive_id", driveId);
    if (candidatesError) throw candidatesError;

    // 2. Delete Questions
    const { error: questionsError } = await supabase.from("questions").delete().eq("drive_id", driveId);
    if (questionsError) throw questionsError;

    // 3. Delete Drive itself
    const { error: driveError } = await supabase.from("drives").delete().eq("id", driveId);
    if (driveError) throw driveError;

    return NextResponse.json({ success: true, message: "Drive and all associated data purged successfully" });
  } catch (error) {
    console.error("Purge Error:", error);
    return NextResponse.json({ error: "Failed to purge drive data" }, { status: 500 });
  }
}
