import { NextRequest, NextResponse } from 'next/server';
import { chat } from '@/lib/llm';

export async function POST(req: NextRequest) {
  try {
    const { text, title } = await req.json();
    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const truncated = text.length > 2000 ? text.substring(0, 2000) + '...' : text;
    const contextInfo = title ? `论文标题：${title}\n\n` : '';

    const result = await chat([
      { role: 'system', content: '你是一个学术论文阅读助手。用户正在阅读一篇学术论文，选中了其中一段文本，请你用中文进行解释和说明。要求：1.解释该段文本的含义，包括其中的专业术语；2.如果是实验方法，说明其原理；3.如果是结果，解释其意义；4.简洁明了，不超过300字。' },
      { role: 'user', content: contextInfo + truncated },
    ], { temperature: 0.3 });

    return NextResponse.json({ explanation: result });
  } catch (err: any) {
    console.error('Explain selection failed:', err);
    return NextResponse.json({ error: err.message || 'Explanation failed' }, { status: 500 });
  }
}
