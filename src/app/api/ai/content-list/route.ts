import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

export async function GET(req: NextRequest) {
  const type = new URL(req.url).searchParams.get('type') || '';

  const db = getDb();
  let rows: any[];

  switch (type) {
    case 'article':
      rows = db.prepare('SELECT id, title FROM articles ORDER BY created_at DESC').all();
      break;
    case 'speech':
      rows = db.prepare('SELECT id, title FROM speeches ORDER BY speech_date DESC').all();
      break;
    case 'paper':
      rows = db.prepare('SELECT id, title FROM academic_papers ORDER BY created_at DESC').all();
      break;
    default:
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  return NextResponse.json({ data: rows });
}
