import { NextResponse } from 'next/server';
import { getAnalysisStats } from '@/lib/ai-helpers';

export async function GET() {
  try {
    const stats = getAnalysisStats();
    return NextResponse.json(stats);
  } catch (err) {
    console.error('Failed to get AI stats:', err);
    return NextResponse.json({ error: 'Failed to get stats' }, { status: 500 });
  }
}
