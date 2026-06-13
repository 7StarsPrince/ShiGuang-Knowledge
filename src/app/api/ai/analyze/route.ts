import { NextRequest, NextResponse } from 'next/server';
import { analyzeAndStore, ContentType } from '@/lib/ai-helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contentType, contentId } = body as { contentType: ContentType; contentId: number };

    if (!contentType || !contentId) {
      return NextResponse.json({ error: 'contentType and contentId are required' }, { status: 400 });
    }
    if (!['article', 'speech', 'paper'].includes(contentType)) {
      return NextResponse.json({ error: 'Invalid contentType' }, { status: 400 });
    }

    const result = await analyzeAndStore(contentType, contentId);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('AI analyze error:', err);
    return NextResponse.json({ error: err.message || 'Analysis failed' }, { status: 500 });
  }
}
