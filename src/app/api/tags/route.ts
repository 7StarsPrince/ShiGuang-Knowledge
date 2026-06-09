import { NextResponse } from 'next/server';
import getDb from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare(
      `SELECT t.id, t.name,
              COUNT(DISTINCT st.speech_id) AS speech_count,
              COUNT(DISTINCT at2.article_id) AS article_count
       FROM tags t
       LEFT JOIN speech_tags st ON t.id = st.tag_id
       LEFT JOIN article_tags at2 ON t.id = at2.tag_id
       GROUP BY t.id, t.name
       ORDER BY (COUNT(DISTINCT st.speech_id) + COUNT(DISTINCT at2.article_id)) DESC`
    ).all();
    return NextResponse.json(rows);
  } catch (err) {
    console.error('Failed to fetch tags:', err);
    return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 });
  }
}
