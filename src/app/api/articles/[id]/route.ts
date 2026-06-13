import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = getDb();
    const article = db.prepare(
      `SELECT a.*, GROUP_CONCAT(DISTINCT t.name) AS tags,
        tp.name AS topic_name
       FROM articles a
       LEFT JOIN article_tags at2 ON a.id = at2.article_id
       LEFT JOIN tags t ON at2.tag_id = t.id
       LEFT JOIN topics tp ON a.topic_id = tp.id
       WHERE a.id = ?
       GROUP BY a.id`
    ).get(id) as any;

    if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(article);
  } catch (err) {
    console.error('Failed to fetch article:', err);
    return NextResponse.json({ error: 'Failed to fetch article' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = getDb();
    const body = await req.json();
    const { title, source_name, source_url, author, summary, content, content_html, cover_image, published_at, topic_id, tags } = body;

    db.prepare(
      `UPDATE articles SET title=?, source_name=?, source_url=?, author=?, summary=?, content=?, content_html=?, cover_image=?, published_at=?, topic_id=? WHERE id=?`
    ).run(title, source_name || null, source_url || null, author || null, summary || null, content || null, content_html || null, cover_image || null, published_at || null, topic_id || null, id);

    if (tags) {
      db.prepare(`DELETE FROM article_tags WHERE article_id = ?`).run(id);
      const insertTag = db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`);
      const getTag = db.prepare(`SELECT id FROM tags WHERE name = ?`);
      const linkTag = db.prepare(`INSERT OR IGNORE INTO article_tags (article_id, tag_id) VALUES (?, ?)`);
      for (const name of tags) {
        insertTag.run(name);
        const tagId = (getTag.get(name) as any).id;
        linkTag.run(id, tagId);
      }
    }

    return NextResponse.json({ message: 'Updated' });
  } catch (err) {
    console.error('Failed to update article:', err);
    return NextResponse.json({ error: 'Failed to update article' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    getDb().prepare(`DELETE FROM articles WHERE id = ?`).run(id);
    return NextResponse.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Failed to delete article:', err);
    return NextResponse.json({ error: 'Failed to delete article' }, { status: 500 });
  }
}
