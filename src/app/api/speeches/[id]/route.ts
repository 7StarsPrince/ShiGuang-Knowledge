import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = getDb();
    const speech = db.prepare(
      `SELECT s.*, GROUP_CONCAT(DISTINCT t.name) AS tags,
        tp.name AS topic_name
       FROM speeches s
       LEFT JOIN speech_tags st ON s.id = st.speech_id
       LEFT JOIN tags t ON st.tag_id = t.id
       LEFT JOIN topics tp ON s.topic_id = tp.id
       WHERE s.id = ?
       GROUP BY s.id`
    ).get(id) as any;

    if (!speech) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    speech.slides = db.prepare(
      `SELECT * FROM speech_slides WHERE speech_id = ? ORDER BY slide_order`
    ).all(id);

    return NextResponse.json(speech);
  } catch (err) {
    console.error('Failed to fetch speech:', err);
    return NextResponse.json({ error: 'Failed to fetch speech' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = getDb();
    const body = await req.json();
    const { title, conference, speaker, speech_date, topic_id, transcript, notes, tags } = body;

    db.prepare(
      `UPDATE speeches SET title=?, conference=?, speaker=?, speech_date=?, topic_id=?, transcript=?, notes=? WHERE id=?`
    ).run(title, conference || null, speaker || null, speech_date || null, topic_id || null, transcript || null, notes || null, id);

    if (tags) {
      db.prepare(`DELETE FROM speech_tags WHERE speech_id = ?`).run(id);
      const insertTag = db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`);
      const getTag = db.prepare(`SELECT id FROM tags WHERE name = ?`);
      const linkTag = db.prepare(`INSERT OR IGNORE INTO speech_tags (speech_id, tag_id) VALUES (?, ?)`);
      for (const name of tags) {
        insertTag.run(name);
        const tagId = (getTag.get(name) as any).id;
        linkTag.run(id, tagId);
      }
    }

    return NextResponse.json({ message: 'Updated' });
  } catch (err) {
    console.error('Failed to update speech:', err);
    return NextResponse.json({ error: 'Failed to update speech' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    getDb().prepare(`DELETE FROM speeches WHERE id = ?`).run(id);
    return NextResponse.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Failed to delete speech:', err);
    return NextResponse.json({ error: 'Failed to delete speech' }, { status: 500 });
  }
}
