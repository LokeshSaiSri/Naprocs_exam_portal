import { NextResponse } from 'next/server';
import supabase from '@/lib/supabase';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const { id } = params;

    // 1. Clear Candidate Status and Session Locks
    const { data: candidate, error: candidateError } = await supabase
      .from('candidates')
      .update({
        stage: 'EXAM_PENDING',
        exam_score: 0,
        cheat_warnings: 0,
        current_session_id: null,
        last_active_at: null,
        score_logic: 0,
        score_architecture: 0,
        score_linguistic: 0,
        score_mission: 0
      })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (candidateError) throw candidateError;

    if (!candidate) {
      return NextResponse.json({ success: false, error: 'Candidate not found' }, { status: 404 });
    }

    // 2. Wipe all existing exam sessions for this candidate to ensure a fresh start
    const { error: sessionError } = await supabase.from('exam_sessions').delete().eq('candidate_id', id);
    if (sessionError) throw sessionError;

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
