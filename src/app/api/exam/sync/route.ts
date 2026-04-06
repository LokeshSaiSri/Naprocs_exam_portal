import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import ExamSession from "@/models/ExamSession";
import Candidate from "@/models/Candidate";

export async function POST(req: Request) {
  try {
    await connectToDatabase();

    const body = await req.json();
    const { sessionId, candidateId, incomingResponses } = body;

    if (!sessionId || !candidateId || !incomingResponses) {
      return NextResponse.json({ error: "Invalid sync ping structure" }, { status: 400 });
    }

    // Ping the lightweight update
    const syncedSession = await ExamSession.findByIdAndUpdate(
      sessionId,
      { $set: { responses: incomingResponses } },
      { new: true, runValidators: false }
    );

    if (!syncedSession) {
      return NextResponse.json({ error: "Session mapping fault" }, { status: 404 });
    }

    // Update Heartbeat to maintain concurrency lock
    await Candidate.findByIdAndUpdate(candidateId, { 
       $set: { lastActiveAt: new Date() } 
    });

    return NextResponse.json({ success: true, timestamp: Date.now() }, { status: 200 });
    
  } catch (error: any) {
    console.error("Exam Sync Fault:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
