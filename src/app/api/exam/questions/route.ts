import { NextResponse } from "next/server";
import mongoose from "mongoose";
import connectToDatabase from "@/lib/mongodb";
import Question from "@/models/Question";
import ExamSession from "@/models/ExamSession";
import Candidate from "@/models/Candidate";
import Drive from "@/models/Drive";
import crypto from "crypto";

export async function GET(req: Request) {
  try {
    await connectToDatabase();
    
    const { searchParams } = new URL(req.url);
    const candidateId = searchParams.get("candidateId");

    if (!candidateId) {
      return NextResponse.json({ error: "Candidate identity required for session initialization" }, { status: 400 });
    }

    // 1. Fetch Candidate & Drive
    const candidate = await Candidate.findById(candidateId);
    if (!candidate) {
       return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const drive = await Drive.findById(candidate.driveId);
    if (!drive) {
       return NextResponse.json({ error: "Associated recruitment drive not found" }, { status: 404 });
    }

    // 2. Initialize or Resume Exam Session
    let session = await ExamSession.findOne({ candidateId, status: 'IN_PROGRESS' });
    
    let questionsToDeliver: any[] = [];

    if (!session) {
      // 2.1 Get Global Defaults for Fallback
      let globalSettings = await mongoose.model('Settings').findOne({});
      
      const mcqCount = drive.mcqCount || globalSettings?.mcqCount || 15;
      const codingCount = drive.codingCount || globalSettings?.codingCount || 2;

      // PERFORM RANDOM POOLING (First time session initialization)
      // Explicitly convert drive._id to ObjectId for aggregate $match
      const targetDriveObjectId = new mongoose.Types.ObjectId(drive._id as string);

      const poolMcqs = await Question.aggregate([
        { $match: { driveId: targetDriveObjectId, type: 'MCQ' } },
        { $sample: { size: mcqCount } }
      ]);
      
      const poolCoding = await Question.aggregate([
        { $match: { driveId: targetDriveObjectId, type: 'CODING' } },
        { $sample: { size: codingCount } }
      ]);

      questionsToDeliver = [...poolMcqs, ...poolCoding];
      
      // Store the specific IDs in the session so they don't change on refresh
      session = await ExamSession.create({
        candidateId,
        status: 'IN_PROGRESS',
        startTime: new Date(),
        responses: {},
        questionIds: questionsToDeliver.map(q => q._id)
      });
    } else {
      // RESUME: Fetch the exact questions already picked for this student
      const pickedIds = session.questionIds || [];
      if (pickedIds.length > 0) {
        questionsToDeliver = await Question.find({ _id: { $in: pickedIds } });
      } else {
        // Fallback for sessions created before this architectural change
        questionsToDeliver = await Question.find({ driveId: drive._id });
      }
    }

    // 3. Mapping payload for the client (Removing Correct Answers + Hashing Hidden Tests)
    const sanitizedQuestions = questionsToDeliver.map((qObject: any) => {
      const q = qObject.toObject ? qObject.toObject() : qObject;
      const safeQuestion = { ...q, _id: q._id.toString() };
      
      // If MCQ: Scrub the Correct Answer
      if (safeQuestion.type === 'MCQ') {
        delete safeQuestion.correctAnswer;
      }
      
      // If Coding: Handle the TestCases
      if (safeQuestion.type === 'CODING' && Array.isArray(safeQuestion.testCases)) {
        safeQuestion.testCases = safeQuestion.testCases.map((tc: any) => {
          if (tc.isHidden) {
            const hash = crypto.createHash('sha256').update(tc.expectedOutput).digest('hex');
            return {
              ...tc,
              _id: tc._id ? tc._id.toString() : undefined,
              expectedOutput: hash 
            };
          }
          return {
             ...tc,
             _id: tc._id ? tc._id.toString() : undefined,
          };
        });
      }
      
      return safeQuestion;
    });

    // 4. Resolve Settings Hierarchy: Drive > Global Defaults
    let globalSettings = await mongoose.model('Settings').findOne({});
    const driveObj = drive.toObject ? drive.toObject() : drive;

    // Merge logic: If drive has these proctoring fields, they override global. 
    // Otherwise fallback to global or model defaults.
    const resolvedSettings = {
       ...driveObj,
       maxCheatWarnings: drive.maxCheatWarnings ?? globalSettings?.maxCheatWarnings ?? 3,
       proctoringSeverity: drive.proctoringSeverity ?? globalSettings?.proctoringSensitivity ?? 'MEDIUM'
    };

    return NextResponse.json({ 
      success: true, 
      questions: sanitizedQuestions, 
      settings: resolvedSettings, // Return merged settings for frontend consumption
      sessionId: session._id,
      currentStage: session.currentStage || 'MCQ',
      existingResponses: session.responses || {}
    }, { status: 200 });
    
  } catch (error: any) {
    console.error("Exam Fetch Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
