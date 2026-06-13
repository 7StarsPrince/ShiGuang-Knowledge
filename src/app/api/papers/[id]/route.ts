import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = getDb();
    const paper = db.prepare(
      `SELECT p.*, GROUP_CONCAT(DISTINCT t.name) AS tags,
        tp.name AS topic_name
       FROM academic_papers p
       LEFT JOIN paper_tags pt ON p.id = pt.paper_id
       LEFT JOIN tags t ON pt.tag_id = t.id
       LEFT JOIN topics tp ON p.topic_id = tp.id
       WHERE p.id = ?
       GROUP BY p.id`
    ).get(id) as any;

    if (!paper) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(paper);
  } catch (err) {
    console.error('Failed to fetch paper:', err);
    return NextResponse.json({ error: 'Failed to fetch paper' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = getDb();
    const body = await req.json();
    const { title, authors, abstract, content, journal, year, doi, url, keywords, topic_id, notes, tags } = body;

    const fields: Record<string, any> = {};
    if (title !== undefined) fields.title = title;
    if (authors !== undefined) fields.authors = authors || null;
    if (abstract !== undefined) fields.abstract = abstract || null;
    if (content !== undefined) fields.content = content || null;
    if (journal !== undefined) fields.journal = journal || null;
    if (year !== undefined) fields.year = year || null;
    if (doi !== undefined) fields.doi = doi || null;
    if (body.url !== undefined) fields.url = body.url || null;
    if (keywords !== undefined) fields.keywords = keywords || null;
    if (topic_id !== undefined) fields.topic_id = topic_id || null;
    if (notes !== undefined) fields.notes = notes || null;

    if (Object.keys(fields).length > 0) {
      const setClause = Object.keys(fields).map(k => `${k} = ?`).join(', ');
      db.prepare(`UPDATE academic_papers SET ${setClause} WHERE id = ?`).run(...Object.values(fields), id);
    }

    if (tags) {
      db.prepare('DELETE FROM paper_tags WHERE paper_id = ?').run(id);
      const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
      const getTag = db.prepare('SELECT id FROM tags WHERE name = ?');
      const linkTag = db.prepare('INSERT OR IGNORE INTO paper_tags (paper_id, tag_id) VALUES (?, ?)');
      for (const name of tags) {
        insertTag.run(name);
        const tagId = (getTag.get(name) as any).id;
        linkTag.run(id, tagId);
      }
    }

    return NextResponse.json({ message: 'Updated' });
  } catch (err) {
    console.error('Failed to update paper:', err);
    return NextResponse.json({ error: 'Failed to update paper' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    getDb().prepare('DELETE FROM academic_papers WHERE id = ?').run(id);
    return NextResponse.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Failed to delete paper:', err);
    return NextResponse.json({ error: 'Failed to delete paper' }, { status: 500 });
  }
}
