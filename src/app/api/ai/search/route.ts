import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') || '';
  const limit = 20;

  try {
    const db = getDb();
    const like = `%${q}%`;
    const results: Array<{ type: string; id: number; title: string; summary: string }> = [];

    // Search articles
    const articles = db.prepare(
      `SELECT id, title, summary FROM articles WHERE title LIKE ? OR content LIKE ? LIMIT ?`
    ).all(like, like, limit) as any[];
    for (const a of articles) results.push({ type: 'article', id: a.id, title: a.title, summary: (a.summary || '').slice(0, 100) });

    // Search speeches
    const speeches = db.prepare(
      `SELECT id, title, conference FROM speeches WHERE title LIKE ? OR transcript LIKE ? LIMIT ?`
    ).all(like, like, limit) as any[];
    for (const s of speeches) results.push({ type: 'speech', id: s.id, title: s.title, summary: (s.conference || '') });

    // Search papers
    const papers = db.prepare(
      `SELECT id, title, abstract FROM academic_papers WHERE title LIKE ? OR abstract LIKE ? LIMIT ?`
    ).all(like, like, limit) as any[];
    for (const p of papers) results.push({ type: 'paper', id: p.id, title: p.title, summary: (p.abstract || '').slice(0, 100) });

    return NextResponse.json({ data: results });
  } catch (err) {
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
