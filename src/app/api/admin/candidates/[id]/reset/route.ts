import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Candidate from '@/models/Candidate';
import ExamSession from '@/models/ExamSession';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await dbConnect();
    const params = await context.params;
    const { id } = params;

    // 1. Clear Candidate Status and Session Locks
    const candidate = await Candidate.findByIdAndUpdate(
      id,
      {
        $set: {
          stage: 'EXAM_PENDING',
          examScore: 0,
          cheatWarnings: 0,
          currentSessionId: null,
          lastActiveAt: null,
          scoreLogic: 0,
          scoreArchitecture: 0,
          scoreLinguistic: 0,
          scoreMission: 0
        }
      },
      { new: true }
    );

    if (!candidate) {
      return NextResponse.json({ success: false, error: 'Candidate not found' }, { status: 404 });
    }

    // 2. Wipe all existing exam sessions for this candidate to ensure a fresh start
    // We use deleteMany to clear potential multiple dangling sessions
    await ExamSession.deleteMany({ candidateId: id });

    console.log(`[Admin] Reset performed for candidate: ${candidate.email} (${id})`);

    return NextResponse.json({ 
      success: true, 
      message: 'Candidate attempt reset successfully and sessions purged.' 
    });
  } catch (error) {
    console.error("Reset API Exception:", error);
    return NextResponse.json({ success: false, error: 'Reset operation failed' }, { status: 500 });
  }
}
