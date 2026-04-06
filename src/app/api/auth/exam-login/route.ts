import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import Candidate from "@/models/Candidate";
import Drive from "@/models/Drive";
import crypto from "crypto";
import { formatToIST } from "@/lib/time";

export async function POST(req: Request) {
  try {
    await connectToDatabase();

    const body = await req.json();
    const { email, accessPin } = body;

    if (!email || !accessPin) {
      return NextResponse.json({ error: "Email and Access PIN are required" }, { status: 400 });
    }

    // 1. Find Candidate First to get their Drive Association
    const candidate = await Candidate.findOne({ email, accessPin });
    if (!candidate) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // 2. Fetch Associated Drive and Enforce Specific Scheduling Window
    const drive = await Drive.findById(candidate.driveId);
    if (!drive) {
      return NextResponse.json({ error: "Your recruitment drive record is missing. Please contact admin." }, { status: 404 });
    }

    if (!drive.isExamActive) {
      return NextResponse.json({ 
        error: "The assessment portal for your batch is currently deactivated." 
      }, { status: 403 });
    }

    const now = new Date();
    if (drive.examStart && now < new Date(drive.examStart)) {
      return NextResponse.json({ 
        error: `Your assessment portal opens on ${formatToIST(drive.examStart)}` 
      }, { status: 403 });
    }
    if (drive.examEnd && now > new Date(drive.examEnd)) {
      return NextResponse.json({ 
        error: "The assessment window for your batch has closed." 
      }, { status: 403 });
    }

    // 3. Multi-Device Security Layer
    const SESSION_EXPIRY_SECONDS = 120; // 2 minutes
    
    if (candidate.lastActiveAt) {
      const timeSinceLastActive = (now.getTime() - new Date(candidate.lastActiveAt).getTime()) / 1000;
      if (timeSinceLastActive < SESSION_EXPIRY_SECONDS) {
        return NextResponse.json({ 
          error: "Active session detected on another device. Please wait 2 minutes for the previous session to expire or close other tabs.",
          name: candidate.name,
          collegeRollNumber: candidate.collegeRollNumber
        }, { status: 409 });
      }
    }

    // Generate a simple mock pseudo-token for the session
    const token = crypto.randomBytes(32).toString('hex');

    // Claim the session
    await Candidate.findByIdAndUpdate(candidate._id, {
      lastActiveAt: now,
      currentSessionId: token
    });

    return NextResponse.json(
      { 
        success: true, 
        candidateId: candidate._id, 
        name: candidate.name,
        collegeRollNumber: candidate.collegeRollNumber,
        token 
      }, 
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Login Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
