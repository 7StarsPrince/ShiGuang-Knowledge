import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();

    // Get all topics
    const topics = db.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM speeches WHERE topic_id = t.id) +
        (SELECT COUNT(*) FROM articles WHERE topic_id = t.id) AS direct_count
      FROM topics t
      ORDER BY t.sort_order, t.id
    `).all();

    // Build hierarchical structure
    const topicMap = new Map<number, any>();
    const roots: any[] = [];

    for (const t of topics as any[]) {
      topicMap.set(t.id, { ...t, children: [] });
    }

    for (const t of topics as any[]) {
      const node = topicMap.get(t.id);
      if (t.parent_id && topicMap.has(t.parent_id)) {
        topicMap.get(t.parent_id).children.push(node);
      } else {
        roots.push(node);
      }
    }

    // Compute total count (including children) for each node
    function computeTotal(node: any): number {
      let total = node.direct_count || 0;
      for (const child of node.children) {
        total += computeTotal(child);
      }
      node.total_count = total;
      return total;
    }
    for (const root of roots) computeTotal(root);

    return NextResponse.json(roots);
  } catch (err) {
    console.error('Failed to fetch topics:', err);
    return NextResponse.json({ error: 'Failed to fetch topics' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const { name, parent_id } = await req.json();

    if (!name?.trim()) {
      return NextResponse.json({ error: '话题名称不能为空' }, { status: 400 });
    }

    // Get next sort_order
    const maxOrder = db.prepare(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM topics WHERE parent_id IS ?'
    ).get(parent_id ?? null) as any;

    const info = db.prepare(
      'INSERT INTO topics (name, parent_id, sort_order) VALUES (?, ?, ?)'
    ).run(name.trim(), parent_id || null, maxOrder.next);

    return NextResponse.json({ id: info.lastInsertRowid, name: name.trim(), parent_id: parent_id || null }, { status: 201 });
  } catch (err) {
    console.error('Failed to create topic:', err);
    return NextResponse.json({ error: 'Failed to create topic' }, { status: 500 });
  }
}
