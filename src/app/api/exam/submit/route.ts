import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import ExamSession from "@/models/ExamSession";
import Candidate from "@/models/Candidate";
import Question from "@/models/Question";

export async function POST(req: Request) {
  try {
    await connectToDatabase();

    const body = await req.json();
    const { sessionId, candidateId, finalResponses, stageAction } = body;

    if (!sessionId || !candidateId) {
      return NextResponse.json({ error: "Missing identity constraints" }, { status: 400 });
    }

    // 1. Handle Stage Transition (MCQ -> CODING)
    if (stageAction === 'MCQ_SUBMIT') {
       const session = await ExamSession.findByIdAndUpdate(
          sessionId,
          { 
             $set: { 
                responses: finalResponses, 
                currentStage: 'CODING' 
             } 
          },
          { new: true }
       );
       
       if (!session) {
          return NextResponse.json({ error: "Session transition error" }, { status: 404 });
       }

       return NextResponse.json({ 
          success: true, 
          message: "MCQ Stage Submitted. Proceeding to Coding Section.",
          nextStage: 'CODING'
       }, { status: 200 });
    }

    // 2. Full Completion (CODING -> END)
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
 
    // 3. Generate Final Score calculation
    // Pull the specific questions assigned to THIS candidate
    const assignedQuestions = await Question.find({ _id: { $in: session.questionIds } }).lean();
    
    // Fallback for legacy sessions or edge cases where questionIds might be missing
    const evaluationPool = assignedQuestions.length > 0 
       ? assignedQuestions 
       : await Question.find({ _id: { $in: Object.keys(finalResponses) } }).lean();
    
    let totalScore = 0;
    const maximumPossibleScore = evaluationPool.length * 10; // 10 points per module
 
    for (const q of evaluationPool) {
       const userRes = finalResponses[q._id.toString()];
       
       if (q.type === 'MCQ') {
          // Precise MCQ match logic: Check if text matches q.correctAnswer
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
 
    const percentileScore = maximumPossibleScore > 0 
       ? Math.floor((totalScore / maximumPossibleScore) * 100)
       : 0;

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
