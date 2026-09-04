import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const { id } = params;
    const body = await req.json();

    // We expect either techNotes, hrNotes, numeric rubrics, or stage transitions
    const { techNotes, hrNotes, scoreLogic, scoreArchitecture, scoreLinguistic, scoreMission, stage } = body;

    const updatePayload: any = {};
    if (techNotes !== undefined) updatePayload.tech_notes = techNotes;
    if (hrNotes !== undefined) updatePayload.hr_notes = hrNotes;
    if (scoreLogic !== undefined) updatePayload.score_logic = scoreLogic;
    if (scoreArchitecture !== undefined) updatePayload.score_architecture = scoreArchitecture;
    if (scoreLinguistic !== undefined) updatePayload.score_linguistic = scoreLinguistic;
    if (scoreMission !== undefined) updatePayload.score_mission = scoreMission;
    if (stage !== undefined) updatePayload.stage = stage;

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: "Evaluation payload empty" }, { status: 400 });
    }

    const { data: updatedCandidate, error } = await supabase
      .from("candidates")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) throw error;

    if (!updatedCandidate) {
      return NextResponse.json({ error: "Candidate reference null" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Interviewer matrices persisted to candidate profile."
    }, { status: 200 });

  } catch (error: any) {
    console.error("Evaluation Patch Failure:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
