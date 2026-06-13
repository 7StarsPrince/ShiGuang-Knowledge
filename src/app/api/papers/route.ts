import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { analyzeAndStore } from '@/lib/ai-helpers';

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');

    const papers = db.prepare(
      `SELECT p.*, GROUP_CONCAT(DISTINCT t.name) AS tags,
        tp.name AS topic_name
       FROM academic_papers p
       LEFT JOIN paper_tags pt ON p.id = pt.paper_id
       LEFT JOIN tags t ON pt.tag_id = t.id
       LEFT JOIN topics tp ON p.topic_id = tp.id
       GROUP BY p.id
       ORDER BY p.created_at DESC
       LIMIT ?`
    ).all(limit);

    return NextResponse.json({ data: papers, total: papers.length });
  } catch (err) {
    console.error('Failed to fetch papers:', err);
    return NextResponse.json({ error: 'Failed to fetch papers' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { title, authors, abstract, content, journal, year, doi, url, keywords, topic_id, notes, tags } = body;

    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

    const info = db.prepare(
      `INSERT INTO academic_papers (title, authors, abstract, content, journal, year, doi, url, keywords, topic_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(title, authors || null, abstract || null, content || null, journal || null, year || null, doi || null, url || null, keywords || null, topic_id || null, notes || null);

    const paperId = info.lastInsertRowid as number;

    if (tags && tags.length > 0) {
      const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
      const getTag = db.prepare('SELECT id FROM tags WHERE name = ?');
      const linkTag = db.prepare('INSERT OR IGNORE INTO paper_tags (paper_id, tag_id) VALUES (?, ?)');
      for (const name of tags) {
        insertTag.run(name);
        const tagId = (getTag.get(name) as any).id;
        linkTag.run(paperId, tagId);
      }
    }

    // Fire-and-forget AI analysis
    if (body.abstract || body.content) {
      analyzeAndStore('paper', paperId).catch(err =>
        console.error('Background AI analysis failed:', err)
      );
    }

    return NextResponse.json({ id: paperId, message: 'Paper created' }, { status: 201 });
  } catch (err) {
    console.error('Failed to create paper:', err);
    return NextResponse.json({ error: 'Failed to create paper' }, { status: 500 });
  }
}
