import { NextResponse } from 'next/server';
import getDb from '@/lib/db';

const ALLOWED_MODES = ['2d', '3d'];

function getKey(mode: string) {
  return `knowledge_graph_camera_${mode}`;
}

function getMode(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || '3d';
  return ALLOWED_MODES.includes(mode) ? mode : '3d';
}

export async function GET(request: Request) {
  try {
    const mode = getMode(request);
    const db = getDb();
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(getKey(mode)) as { value: string } | undefined;
    if (!row) return NextResponse.json(null);
    return NextResponse.json(JSON.parse(row.value));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const mode = getMode(request);
    const body = await request.json();
    const value = JSON.stringify({ ...body, updated_at: new Date().toISOString() });
    const db = getDb();
    db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(getKey(mode), value);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
