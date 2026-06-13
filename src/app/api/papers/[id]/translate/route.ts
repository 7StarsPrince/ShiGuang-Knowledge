import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { chat } from '@/lib/llm';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = getDb();
    const paper = db.prepare(
      `SELECT p.id, p.title, p.authors, p.abstract, p.keywords, p.content, p.journal FROM academic_papers p WHERE p.id = ?`
    ).get(id) as any;

    if (!paper) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Build content to translate
    const parts: string[] = [];
    if (paper.title) parts.push(`Title: ${paper.title}`);
    if (paper.authors) parts.push(`Authors: ${paper.authors}`);
    if (paper.journal) parts.push(`Journal: ${paper.journal}`);
    if (paper.abstract) parts.push(`Abstract: ${paper.abstract}`);
    if (paper.keywords) parts.push(`Keywords: ${paper.keywords}`);
    // Include content (full text from PDF) if available, truncated
    if (paper.content) {
      const contentPreview = paper.content.length > 3000 ? paper.content.substring(0, 3000) + '...' : paper.content;
      parts.push(`Content: ${contentPreview}`);
    }

    const input = parts.join('\n\n');
    if (!input.trim()) return NextResponse.json({ error: 'No content to translate' }, { status: 400 });

    const translation = await chat([
      {
        role: 'system',
        content: `你是一个学术论文翻译助手。将用户提供的英文学术论文信息翻译为中文。要求：
1. 保持学术专业术语的准确性，必要时在括号内保留英文原文
2. 标题翻译要精炼，摘要翻译要完整流畅
3. 如果原文已经是中文，直接返回原文
4. 按原文结构逐段翻译，保持格式一致
5. 只输出翻译结果，不要有其他解释`,
      },
      { role: 'user', content: input },
    ], { temperature: 0.2, max_tokens: 4096 });

    // Store translation
    db.prepare('UPDATE academic_papers SET translation_zh = ? WHERE id = ?').run(translation, id);

    return NextResponse.json({ translation });
  } catch (err: any) {
    console.error('Translation failed:', err);
    return NextResponse.json({ error: err.message || 'Translation failed' }, { status: 500 });
  }
}
