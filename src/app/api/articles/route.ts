import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { analyzeAndStore } from '@/lib/ai-helpers';

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
      where = `WHERE a.id IN (SELECT at2.article_id FROM article_tags at2 JOIN tags t ON at2.tag_id = t.id WHERE t.name = ?)`;
      params.push(tag);
    }

    const rows = db.prepare(
      `SELECT a.id, a.title, a.source_name, a.source_url, a.author, a.summary, a.cover_image, a.published_at, a.created_at,
              GROUP_CONCAT(DISTINCT t.name) AS tags,
              tp.name AS topic_name
       FROM articles a
       LEFT JOIN article_tags at2 ON a.id = at2.article_id
       LEFT JOIN tags t ON at2.tag_id = t.id
       LEFT JOIN topics tp ON a.topic_id = tp.id
       ${where}
       GROUP BY a.id
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    const totalRow = db.prepare(`SELECT COUNT(*) AS total FROM articles a ${where}`).get(...params) as any;

    return NextResponse.json({ data: rows, total: totalRow.total, page, limit });
  } catch (err) {
    console.error('Failed to fetch articles:', err);
    return NextResponse.json({ error: 'Failed to fetch articles' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { title, source_name, source_url, author, summary, content, content_html, cover_image, published_at, topic_id, tags } = body;

    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

    const info = db.prepare(
      `INSERT INTO articles (title, source_name, source_url, author, summary, content, content_html, cover_image, published_at, topic_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(title, source_name || null, source_url || null, author || null, summary || null, content || null, content_html || null, cover_image || null, published_at || null, topic_id || null);

    const articleId = info.lastInsertRowid as number;

    if (tags?.length) {
      const insertTag = db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`);
      const getTag = db.prepare(`SELECT id FROM tags WHERE name = ?`);
      const linkTag = db.prepare(`INSERT OR IGNORE INTO article_tags (article_id, tag_id) VALUES (?, ?)`);
      for (const name of tags) {
        insertTag.run(name);
        const tagId = (getTag.get(name) as any).id;
        linkTag.run(articleId, tagId);
      }
    }

    // Fire-and-forget AI analysis
    if (body.content || body.content_html) {
      analyzeAndStore('article', articleId).catch(err =>
        console.error('Background AI analysis failed:', err)
      );
    }

    return NextResponse.json({ id: articleId, message: 'Article created' }, { status: 201 });
  } catch (err) {
    console.error('Failed to create article:', err);
    return NextResponse.json({ error: 'Failed to create article' }, { status: 500 });
  }
}
