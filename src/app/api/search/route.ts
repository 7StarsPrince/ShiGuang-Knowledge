import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q');
  if (!q) return NextResponse.json({ speeches: [], articles: [] });

  const keyword = `%${q}%`;

  try {
    const db = getDb();

    const speeches = db.prepare(
      `SELECT s.*, GROUP_CONCAT(DISTINCT t.name) AS tags
       FROM speeches s
       LEFT JOIN speech_tags st ON s.id = st.speech_id
       LEFT JOIN tags t ON st.tag_id = t.id
       WHERE s.title LIKE ? OR s.conference LIKE ? OR s.speaker LIKE ? OR s.transcript LIKE ?
       GROUP BY s.id
       ORDER BY s.speech_date DESC
       LIMIT 20`
    ).all(keyword, keyword, keyword, keyword);

    const articles = db.prepare(
      `SELECT a.id, a.title, a.source_name, a.source_url, a.author, a.summary, a.cover_image, a.published_at, a.created_at,
              GROUP_CONCAT(DISTINCT t.name) AS tags
       FROM articles a
       LEFT JOIN article_tags at2 ON a.id = at2.article_id
       LEFT JOIN tags t ON at2.tag_id = t.id
       WHERE a.title LIKE ? OR a.summary LIKE ? OR a.content LIKE ? OR a.source_name LIKE ?
       GROUP BY a.id
       ORDER BY a.created_at DESC
       LIMIT 20`
    ).all(keyword, keyword, keyword, keyword);

    return NextResponse.json({ speeches, articles });
  } catch (err) {
    console.error('Search failed:', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
