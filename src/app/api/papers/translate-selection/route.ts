import { NextRequest, NextResponse } from 'next/server';
import { chat } from '@/lib/llm';

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const truncated = text.length > 2000 ? text.substring(0, 2000) + '...' : text;

    const result = await chat([
      { role: 'system', content: '你是一个学术论文翻译助手。将用户选中的文本翻译为中文。要求：1.保持学术专业术语的准确性，必要时在括号内保留英文原文；2.如果原文已经是中文，直接返回原文；3.只输出翻译结果，不要有其他解释。' },
      { role: 'user', content: truncated },
    ], { temperature: 0.3 });

    return NextResponse.json({ translation: result });
  } catch (err: any) {
    console.error('Translate selection failed:', err);
    return NextResponse.json({ error: err.message || 'Translation failed' }, { status: 500 });
  }
}
