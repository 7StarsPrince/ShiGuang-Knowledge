import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = getDb();
    const { name } = await req.json();

    if (!name?.trim()) {
      return NextResponse.json({ error: '话题名称不能为空' }, { status: 400 });
    }

    db.prepare('UPDATE topics SET name = ? WHERE id = ?').run(name.trim(), id);
    return NextResponse.json({ message: 'Updated' });
  } catch (err) {
    console.error('Failed to update topic:', err);
    return NextResponse.json({ error: 'Failed to update topic' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = getDb();

    // Nullify topic_id on speeches/articles that reference this topic or its children
    const childIds = db.prepare('SELECT id FROM topics WHERE parent_id = ?').all(id) as any[];
    const allIds = [Number(id), ...childIds.map(c => c.id)];

    const nullifySpeeches = db.prepare('UPDATE speeches SET topic_id = NULL WHERE topic_id = ?');
    const nullifyArticles = db.prepare('UPDATE articles SET topic_id = NULL WHERE topic_id = ?');

    for (const tid of allIds) {
      nullifySpeeches.run(tid);
      nullifyArticles.run(tid);
    }

    // Delete topic (CASCADE will delete children)
    db.prepare('DELETE FROM topics WHERE id = ?').run(id);

    return NextResponse.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Failed to delete topic:', err);
    return NextResponse.json({ error: 'Failed to delete topic' }, { status: 500 });
  }
}
