import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = getDb();

    // Get all topic IDs (this topic + children)
    const childIds = db.prepare('SELECT id FROM topics WHERE parent_id = ?').all(id) as any[];
    const allIds = [Number(id), ...childIds.map(c => c.id)];

    const placeholders = allIds.map(() => '?').join(',');

    // Fetch speeches
    const speeches = db.prepare(`
      SELECT s.id, s.title, s.speaker, s.conference, s.speech_date, s.topic_id,
        GROUP_CONCAT(DISTINCT t.name) AS tags
      FROM speeches s
      LEFT JOIN speech_tags st ON s.id = st.speech_id
      LEFT JOIN tags t ON st.tag_id = t.id
      WHERE s.topic_id IN (${placeholders})
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `).all(...allIds);

    // Fetch articles
    const articles = db.prepare(`
      SELECT a.id, a.title, a.source_name, a.published_at, a.topic_id,
        GROUP_CONCAT(DISTINCT t.name) AS tags
      FROM articles a
      LEFT JOIN article_tags at2 ON a.id = at2.article_id
      LEFT JOIN tags t ON at2.tag_id = t.id
      WHERE a.topic_id IN (${placeholders})
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `).all(...allIds);

    return NextResponse.json({ speeches, articles });
  } catch (err) {
    console.error('Failed to fetch topic content:', err);
    return NextResponse.json({ error: 'Failed to fetch content' }, { status: 500 });
  }
}
