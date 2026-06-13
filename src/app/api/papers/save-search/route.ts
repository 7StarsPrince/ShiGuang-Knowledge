import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { analyzeAndStore } from '@/lib/ai-helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, authors, abstract, content, journal, year, doi, url, keywords, source, externalId, topic_id, tags } = body;

    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

    // Check for duplicate by DOI or title
    const db = getDb();
    if (doi) {
      const existing = db.prepare('SELECT id FROM academic_papers WHERE doi = ?').get(doi);
      if (existing) return NextResponse.json({ error: 'This paper already exists in your library', id: (existing as any).id }, { status: 409 });
    }
    const existingByTitle = db.prepare('SELECT id FROM academic_papers WHERE title = ?').get(title);
    if (existingByTitle) return NextResponse.json({ error: 'This paper already exists in your library', id: (existingByTitle as any).id }, { status: 409 });

    const info = db.prepare(
      `INSERT INTO academic_papers (title, authors, abstract, content, journal, year, doi, url, keywords, topic_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      title,
      authors || null,
      abstract || null,
      content || null,
      journal || null,
      year || null,
      doi || null,
      url || null,
      keywords || null,
      topic_id || null
    );

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
    if (abstract || content) {
      analyzeAndStore('paper', paperId).catch(err =>
        console.error('Background AI analysis failed:', err)
      );
    }

    return NextResponse.json({ id: paperId, title, source }, { status: 201 });
  } catch (err) {
    console.error('Save search result failed:', err);
    return NextResponse.json({ error: 'Save failed' }, { status: 500 });
  }
}
