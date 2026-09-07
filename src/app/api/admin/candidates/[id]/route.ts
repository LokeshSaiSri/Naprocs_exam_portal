import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { purgeProctoringForCandidate } from "@/lib/proctoringPurge";

// Deletes one candidate and everything that belongs to them: proctoring
// evidence, exam sessions, their resume file, and finally the candidate row
// itself. Cascade order mirrors the drive-wide purge in
// src/app/api/admin/drives/[id]/route.ts -- proctoring_events has a NOT
// NULL FK into exam_sessions/candidates, so it must go first or the delete
// fails partway through.
export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: candidateId } = await context.params;

    const { data: candidate, error: lookupError } = await supabase
      .from("candidates")
      .select("id,resume_url")
      .eq("id", candidateId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    // 1. Proctoring evidence (events + storage snapshots) -- must precede
    // the exam_sessions delete below.
    await purgeProctoringForCandidate(candidateId);

    // 2. Exam sessions
    const { error: sessionsError } = await supabase
      .from("exam_sessions").delete().eq("candidate_id", candidateId);
    if (sessionsError) throw sessionsError;

    // 3. Resume file in Storage, if any
    if (candidate.resume_url) {
      const { error: storageError } = await supabase.storage.from("resumes").remove([candidate.resume_url]);
      if (storageError) throw storageError;
    }

    // 4. The candidate row itself
    const { error: deleteError } = await supabase.from("candidates").delete().eq("id", candidateId);
    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true, message: "Candidate and all associated data deleted successfully" }, { status: 200 });
  } catch (error: any) {
    console.error("Candidate Delete Failure:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
