import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { toCamelCase } from "@/lib/caseConvert";
import { requireAdmin } from "@/lib/adminAuth";

// Deliberately excludes access_pin -- matches old `.select("-accessPin")`.
const CANDIDATE_COLUMNS =
  "id,drive_id,name,email,phone,college_roll_number,resume_url,exam_score,stage,tech_notes,hr_notes,last_active_at,current_session_id,score_logic,score_architecture,score_linguistic,score_mission,cheat_warnings,created_at,updated_at";

export async function GET(req: Request) {
  try {
    const unauthorized = await requireAdmin();
    if (unauthorized) return unauthorized;

    const { searchParams } = new URL(req.url);
    const stageQuery = searchParams.get("stage");
    const driveId = searchParams.get("driveId");

    let query = supabase.from("candidates").select(CANDIDATE_COLUMNS).order("exam_score", { ascending: false });

    if (stageQuery) {
      query = query.eq("stage", stageQuery);
    } else {
      // Only filter out PENDING if no specific stage is requested
      query = query.neq("stage", "EXAM_PENDING");
    }

    if (driveId) {
      query = query.eq("drive_id", driveId);
    }

    const { data: candidates, error } = await query;
    if (error) throw error;

    // Part 4 decision (2026-09-01): resume_url is now a Supabase Storage
    // object PATH, not a data URI. Resolve it to a short-lived signed URL
    // here at read time -- the frontend just needs a URL it can put in an
    // <iframe src>, same as before.
    const resumePaths = candidates.map((c: any) => c.resume_url).filter(Boolean);
    const signedUrlByPath: Record<string, string> = {};
    if (resumePaths.length > 0) {
      const { data: signedUrls, error: signError } = await supabase.storage
        .from("resumes")
        .createSignedUrls(resumePaths, 3600); // 1 hour
      if (signError) throw signError;
      (signedUrls || []).forEach((s: any) => {
        if (s.signedUrl) signedUrlByPath[s.path] = s.signedUrl;
      });
    }
    const candidatesWithResumeUrls = candidates.map((c: any) => ({
      ...c,
      resume_url: c.resume_url ? (signedUrlByPath[c.resume_url] || null) : c.resume_url,
    }));

    return NextResponse.json({ success: true, count: candidatesWithResumeUrls.length, candidates: toCamelCase(candidatesWithResumeUrls) }, { status: 200 });

  } catch (error: any) {
    console.error("Aggregation Failure:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

const VALID_STAGES = ['EXAM_PENDING', 'EXAM_COMPLETED', 'TECH_ROUND', 'HR_ROUND', 'SELECTED', 'REJECTED'];

export async function PATCH(req: Request) {
  try {
    const unauthorized = await requireAdmin();
    if (unauthorized) return unauthorized;

    const { candidateIds, stage } = await req.json();

    if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0 || !stage) {
      return NextResponse.json({ error: "Invalid bulk transition payload" }, { status: 400 });
    }

    if (!VALID_STAGES.includes(stage)) {
      return NextResponse.json({ error: "Invalid target stage" }, { status: 400 });
    }

    // NOTE (flagged, minor): Postgres UPDATE reports all matched rows as
    // "affected" -- unlike Mongo's modifiedCount, which excludes rows that
    // already had the target stage (a true no-op). matchedCount and
    // modifiedCount are therefore reported equal here; a minor parity gap,
    // not a contract change (both keys still present with sane values).
    const { data, error } = await supabase
      .from("candidates")
      .update({ stage })
      .in("id", candidateIds)
      .select("id");

    if (error) throw error;

    const count = data.length;
    return NextResponse.json({
      success: true,
      matchedCount: count,
      modifiedCount: count,
      message: `${count} Candidate(s) successfully transitioned to ${stage}.`
    }, { status: 200 });

  } catch (error: any) {
    console.error("Bulk Mutation Failure:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
