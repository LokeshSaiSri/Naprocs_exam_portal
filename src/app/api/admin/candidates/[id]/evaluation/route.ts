import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import Candidate from "@/models/Candidate";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();

    const params = await context.params;
    const { id } = params;
    const body = await req.json();
    
    // We expect either techNotes, hrNotes, numeric rubrics, or stage transitions
    const { techNotes, hrNotes, scoreLogic, scoreArchitecture, scoreLinguistic, scoreMission, stage } = body;

    const updatePayload: any = {};
    if (techNotes !== undefined) updatePayload.techNotes = techNotes;
    if (hrNotes !== undefined) updatePayload.hrNotes = hrNotes;
    if (scoreLogic !== undefined) updatePayload.scoreLogic = scoreLogic;
    if (scoreArchitecture !== undefined) updatePayload.scoreArchitecture = scoreArchitecture;
    if (scoreLinguistic !== undefined) updatePayload.scoreLinguistic = scoreLinguistic;
    if (scoreMission !== undefined) updatePayload.scoreMission = scoreMission;
    if (stage !== undefined) updatePayload.stage = stage;

    if (Object.keys(updatePayload).length === 0) {
       return NextResponse.json({ error: "Evaluation payload empty" }, { status: 400 });
    }

    const updatedCandidate = await Candidate.findByIdAndUpdate(
      id,
      { $set: updatePayload },
      { new: true, runValidators: true }
    );

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
