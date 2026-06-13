import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { analyzeAndStore } from '@/lib/ai-helpers';

// GET /api/speeches
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get('page')) || 1;
  const limit = Number(searchParams.get('limit')) || 20;
  const tag = searchParams.get('tag');
  const offset = (page - 1) * limit;

  try {
    const db = getDb();

    let where = '';
    const params: any[] = [];
    if (tag) {
      where = `WHERE s.id IN (SELECT st.speech_id FROM speech_tags st JOIN tags t ON st.tag_id = t.id WHERE t.name = ?)`;
      params.push(tag);
    }

    const rows = db.prepare(
      `SELECT s.*, GROUP_CONCAT(DISTINCT t.name) AS tags, tp.name AS topic_name
       FROM speeches s
       LEFT JOIN speech_tags st ON s.id = st.speech_id
       LEFT JOIN tags t ON st.tag_id = t.id
       LEFT JOIN topics tp ON s.topic_id = tp.id
       ${where}
       GROUP BY s.id
       ORDER BY s.speech_date DESC, s.created_at DESC
       LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    const totalRow = db.prepare(`SELECT COUNT(*) AS total FROM speeches s ${where}`).get(...params) as any;

    return NextResponse.json({ data: rows, total: totalRow.total, page, limit });
  } catch (err) {
    console.error('Failed to fetch speeches:', err);
    return NextResponse.json({ error: 'Failed to fetch speeches' }, { status: 500 });
  }
}

// POST /api/speeches
export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { title, conference, speaker, speech_date, transcript, audio_path, notes, tags } = body;

    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

    const info = db.prepare(
      `INSERT INTO speeches (title, conference, speaker, speech_date, transcript, audio_path, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(title, conference || null, speaker || null, speech_date || null, transcript || null, audio_path || null, notes || null);

    const speechId = info.lastInsertRowid as number;

    if (tags?.length) {
      const insertTag = db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`);
      const getTag = db.prepare(`SELECT id FROM tags WHERE name = ?`);
      const linkTag = db.prepare(`INSERT OR IGNORE INTO speech_tags (speech_id, tag_id) VALUES (?, ?)`);
      for (const name of tags) {
        insertTag.run(name);
        const tagId = (getTag.get(name) as any).id;
        linkTag.run(speechId, tagId);
      }
    }

    // Fire-and-forget AI analysis
    if (body.transcript) {
      analyzeAndStore('speech', speechId).catch(err =>
        console.error('Background AI analysis failed:', err)
      );
    }

    return NextResponse.json({ id: speechId, message: 'Speech created' }, { status: 201 });
  } catch (err) {
    console.error('Failed to create speech:', err);
    return NextResponse.json({ error: 'Failed to create speech' }, { status: 500 });
  }
}
