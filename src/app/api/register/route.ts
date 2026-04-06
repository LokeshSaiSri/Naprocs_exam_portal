import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import Candidate from "@/models/Candidate";
import Drive from "@/models/Drive";
import { formatToIST } from "@/lib/time";

export async function POST(req: Request) {
  try {
    await connectToDatabase();

    const formData = await req.formData();
    const driveId = formData.get("driveId") as string;
    
    if (!driveId) {
      return NextResponse.json({ error: "No target recruitment drive specified" }, { status: 400 });
    }

    // Enforce Drive-Specific Scheduling Window
    const drive = await Drive.findById(driveId);
    if (!drive) {
      return NextResponse.json({ error: "Invalid recruitment drive" }, { status: 404 });
    }

    if (!drive.isExamActive) {
      return NextResponse.json({ 
        error: "Registration for this drive is currently deactivated." 
      }, { status: 403 });
    }

    const now = new Date();
    if (drive.regStart && now < new Date(drive.regStart)) {
      return NextResponse.json({ 
        error: `Registration for this drive opens on ${formatToIST(drive.regStart)}` 
      }, { status: 403 });
    }
    if (drive.regEnd && now > new Date(drive.regEnd)) {
      return NextResponse.json({ 
        error: "The registration window for this batch has closed." 
      }, { status: 403 });
    }
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const phone = formData.get("phone") as string;
    const collegeRollNumber = formData.get("collegeRollNumber") as string;
    const resumeFile = formData.get("resume") as File;

    if (!name || !email || !phone || !collegeRollNumber || !resumeFile) {
      return NextResponse.json({ error: "Missing required fields or resume file" }, { status: 400 });
    }

    // Check if user already exists
    const existing = await Candidate.findOne({ $or: [{ email }, { collegeRollNumber }] });
    if (existing) {
      return NextResponse.json({ error: "Candidate with this email or roll number already registered" }, { status: 409 });
    }

    // Generate random 6-digit access PIN
    const accessPin = Math.floor(100000 + Math.random() * 900000).toString();

    // Process and Save File
    let resumeUrl = "";
    if (resumeFile) {
       // Validate PDF and size
       if (resumeFile.type !== "application/pdf") {
          return NextResponse.json({ error: "Only PDF resumes are supported" }, { status: 400 });
       }
       if (resumeFile.size > 5 * 1024 * 1024) {
          return NextResponse.json({ error: "Resume file size must be under 5MB" }, { status: 413 });
       }

       const bytes = await resumeFile.arrayBuffer();
       const buffer = Buffer.from(bytes);
       
       // Encode to Base64 Data URI for MongoDB persistence (Serverless safe)
       const base64Resume = buffer.toString('base64');
       resumeUrl = `data:application/pdf;base64,${base64Resume}`;
    }

    // Create Candidate
    const newCandidate = await Candidate.create({
      name,
      email,
      phone,
      collegeRollNumber,
      resumeUrl,
      accessPin,
      driveId,
    });

    return NextResponse.json(
      { 
        success: true, 
        message: "Registration successful. Resume uploaded.", 
        accessPin, 
        candidateId: newCandidate._id 
      }, 
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Registration Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
