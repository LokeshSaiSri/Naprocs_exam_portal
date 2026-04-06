import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import ExamSession from "@/models/ExamSession";
import Question from "@/models/Question";
import Candidate from "@/models/Candidate";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    
    const { id: candidateId } = await context.params;
    
    // 1. Fetch the Candidate
    const candidate = await Candidate.findById(candidateId).select("name examScore collegeRollNumber");
    if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

    // 2. Fetch the COMPLETED or TERMINATED session
    const session = await ExamSession.findOne({ 
      candidateId, 
      status: { $in: ['COMPLETED', 'TERMINATED'] } 
    }).sort({ updatedAt: -1 });

    if (!session) {
      return NextResponse.json({ 
        success: true, 
        candidate, 
        report: null, 
        message: "No completed exam session found for this candidate." 
      });
    }

    // 3. Fetch All Questions to compare
    const questions = await Question.find({});
    
    // 4. Build the comparison report
    const responses = session.responses || {};
    const reportDetails = questions.map(q => {
      const resp = responses[q._id.toString()];
      let isCorrect = false;
      let candidateAnswer = "N/A";

      if (q.type === 'MCQ') {
        candidateAnswer = resp?.selectedOption || "No Answer";
        isCorrect = candidateAnswer === q.correctAnswer;
      } else if (q.type === 'CODING') {
        candidateAnswer = resp?.codeStr || "No Code Submitted";
        // For coding, we rely on the pre-evaluated testsPassed from the session/responses metadata
        isCorrect = (resp?.testsPassed > 0 && resp?.testsPassed === resp?.totalTests);
      }

      return {
        _id: q._id,
        title: q.title,
        type: q.type,
        content: q.content,
        options: q.options,
        correctAnswer: q.correctAnswer,
        candidateAnswer,
        isCorrect,
        codingMetadata: q.type === 'CODING' ? { 
          testsPassed: resp?.testsPassed || 0, 
          totalTests: resp?.totalTests || q.testCases?.length || 0 
        } : null
      };
    });

    const durationSeconds = Math.floor((new Date(session.updatedAt).getTime() - new Date(session.startTime).getTime()) / 1000);

    return NextResponse.json({
      success: true,
      candidate,
      session: {
        startTime: session.startTime,
        endTime: session.updatedAt,
        durationSeconds,
        status: session.status
      },
      report: reportDetails
    });

  } catch (error: any) {
    console.error("Exam Report Failure:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
