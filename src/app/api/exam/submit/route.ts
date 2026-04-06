import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import ExamSession from "@/models/ExamSession";
import Candidate from "@/models/Candidate";
import Question from "@/models/Question";

export async function POST(req: Request) {
  try {
    await connectToDatabase();

    const body = await req.json();
    const { sessionId, candidateId, finalResponses } = body;

    if (!sessionId || !candidateId) {
      return NextResponse.json({ error: "Missing identity constraints" }, { status: 400 });
    }

    // Terminate Session
    const session = await ExamSession.findByIdAndUpdate(
      sessionId,
      { 
        $set: { responses: finalResponses, status: 'COMPLETED' } 
      },
      { new: true }
    );

    if (!session) {
      return NextResponse.json({ error: "Session invalidation error" }, { status: 404 });
    }

    // Generate Final Score calculation
    // Pull the master bank
    const masterQuestions = await Question.find({}).lean();
    
    let totalScore = 0;
    let maximumPossibleScore = masterQuestions.length * 10; // Generic arbitrary scale (10 points per module)

    for (const q of masterQuestions) {
       const userRes = finalResponses[q._id.toString()];
       
       if (q.type === 'MCQ') {
          // Robust MCQ match logic: Check if text matches q.correctAnswer OR if it matches q.options[q.correctAnswer]
          const isCorrectIndex = typeof q.correctAnswer === 'number' || !isNaN(Number(q.correctAnswer));
          const expectedText = isCorrectIndex ? q.options[Number(q.correctAnswer)] : q.correctAnswer;
          
          if (userRes && (userRes.selectedOption === expectedText || userRes.selectedOption === q.correctAnswer)) {
             totalScore += 10;
          }
       } else if (q.type === 'CODING') {
          if (userRes && userRes.testsPassed === userRes.totalTests && userRes.totalTests > 0) {
             totalScore += 10; 
          } else if (userRes && userRes.testsPassed > 0) {
             totalScore += Math.floor((userRes.testsPassed / userRes.totalTests) * 10);
          }
       }
    }

    const percentileScore = Math.floor((totalScore / maximumPossibleScore) * 100);

    // Patch Candidate Master Instance
    await Candidate.findByIdAndUpdate(candidateId, {
       $set: {
          examScore: percentileScore,
          stage: 'EXAM_COMPLETED'
       }
    });

    return NextResponse.json({ 
       success: true, 
       finalScore: percentileScore,
       message: "Assessment fully evaluated and synced." 
    }, { status: 200 });

  } catch (error: any) {
    console.error("Exam Final Submit Pipeline Failure:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
