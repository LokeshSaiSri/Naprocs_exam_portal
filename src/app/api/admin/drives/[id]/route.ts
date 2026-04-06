import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import Drive from "@/models/Drive";
import Candidate from "@/models/Candidate";
import Question from "@/models/Question";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const { id } = await params;
    const drive = await Drive.findById(id);
    if (!drive) return NextResponse.json({ error: "Drive not found" }, { status: 404 });
    return NextResponse.json({ success: true, drive });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch drive" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const { id } = await params;
    const body = await req.json();
    const drive = await Drive.findByIdAndUpdate(id, body, { new: true });
    return NextResponse.json({ success: true, drive });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update drive" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    // THE "PURGE" FEATURE: Delete Drive, associated Candidates, and associated Questions
    const { id: driveId } = await params;
    
    // 1. Delete Candidates
    await Candidate.deleteMany({ driveId });
    
    // 2. Delete Questions
    await Question.deleteMany({ driveId });
    
    // 3. Delete Drive itself
    await Drive.findByIdAndDelete(driveId);

    return NextResponse.json({ success: true, message: "Drive and all associated data purged successfully" });
  } catch (error) {
    console.error("Purge Error:", error);
    return NextResponse.json({ error: "Failed to purge drive data" }, { status: 500 });
  }
}
