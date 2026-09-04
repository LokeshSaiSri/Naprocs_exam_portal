import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";

const VALID_STAGES = ['EXAM_PENDING', 'EXAM_COMPLETED', 'TECH_ROUND', 'HR_ROUND', 'SELECTED', 'REJECTED'];

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const { id } = params;
    const { stage } = await req.json();

    if (!stage || !VALID_STAGES.includes(stage)) {
      return NextResponse.json({ error: "Invalid stage descriptor mapped" }, { status: 400 });
    }

    const { data: updatedCandidate, error } = await supabase
      .from("candidates")
      .update({ stage })
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) throw error;

    if (!updatedCandidate) {
      return NextResponse.json({ error: "Candidate reference null" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      stage: updatedCandidate.stage,
      message: "Stage mapping mutated seamlessly."
    }, { status: 200 });

  } catch (error: any) {
    console.error("Mutation Stage Failure:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
