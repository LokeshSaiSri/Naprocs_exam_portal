import supabase from "@/lib/supabase";

/**
 * Purges every proctoring_events row (and the underlying storage snapshot
 * objects) for one candidate. Extracted from the DELETE handler in
 * src/app/api/admin/candidates/[id]/proctoring/route.ts so the exact same
 * logic can be reused by:
 *  - that route itself (thin wrapper now)
 *  - the single-candidate delete route (src/app/api/admin/candidates/[id]/route.ts)
 *  - the extended re-attempt/reset route, which should not let a previous
 *    attempt's webcam flags carry over into a fresh one
 */
export async function purgeProctoringForCandidate(candidateId: string): Promise<{ purged: number }> {
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

  return { purged: paths.length };
}
