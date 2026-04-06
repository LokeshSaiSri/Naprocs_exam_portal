import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import Candidate from "@/models/Candidate";

export async function GET(req: Request) {
  try {
    await connectToDatabase();

    const { searchParams } = new URL(req.url);
    const stageQuery = searchParams.get("stage");
    const driveId = searchParams.get("driveId");

    // Generic aggregation logic
    let filterOptions: any = {};
    if (stageQuery) {
       filterOptions.stage = stageQuery;
    } else {
       // Only filter out PENDING if no specific stage is requested
       filterOptions.stage = { $ne: 'EXAM_PENDING' };
    }

    if (driveId) {
       filterOptions.driveId = driveId;
    }

    // Default sorting to highest exam scores specifically for the Leaderboard mapping
    const candidates = await Candidate.find(filterOptions)
                                    .select("-accessPin") // Strip sensitive access pins
                                    .sort({ examScore: -1 })
                                    .lean();

    return NextResponse.json({ success: true, count: candidates.length, candidates }, { status: 200 });

  } catch (error: any) {
    console.error("Aggregation Failure:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await connectToDatabase();
    
    const { candidateIds, stage } = await req.json();

    if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0 || !stage) {
      return NextResponse.json({ error: "Invalid bulk transition payload" }, { status: 400 });
    }

    const VALID_STAGES = ['EXAM_PENDING', 'EXAM_COMPLETED', 'TECH_ROUND', 'HR_ROUND', 'SELECTED', 'REJECTED'];
    if (!VALID_STAGES.includes(stage)) {
      return NextResponse.json({ error: "Invalid target stage" }, { status: 400 });
    }

    const result = await Candidate.updateMany(
      { _id: { $in: candidateIds } },
      { $set: { stage } }
    );

    return NextResponse.json({ 
      success: true, 
      matchedCount: result.matchedCount, 
      modifiedCount: result.modifiedCount,
      message: `${result.modifiedCount} Candidate(s) successfully transitioned to ${stage}.`
    }, { status: 200 });

  } catch (error: any) {
    console.error("Bulk Mutation Failure:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
