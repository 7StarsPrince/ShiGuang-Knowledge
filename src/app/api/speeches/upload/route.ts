import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const title = formData.get('title') as string;
    const conference = formData.get('conference') as string;
    const speaker = formData.get('speaker') as string;
    const speechDate = formData.get('speech_date') as string;
    const tagsStr = formData.get('tags') as string;

    if (!file || !title) return NextResponse.json({ error: 'File and title are required' }, { status: 400 });

    const speechDir = path.join(process.cwd(), 'uploads', 'speeches', `${Date.now()}-${title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}`);
    fs.mkdirSync(speechDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    const zip = new AdmZip(buffer);
    zip.extractAllTo(speechDir, true);

    const allFiles = fs.readdirSync(speechDir, { recursive: true }) as string[];
    const imgExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    const audioExts = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'];
    const textExts = ['.txt', '.srt', '.vtt'];

    const slides: { order: number; image_path: string }[] = [];
    let audioPath: string | null = null;
    let transcript: string | null = null;

    for (const f of allFiles) {
      const fullPath = path.join(speechDir, f);
      const ext = path.extname(f).toLowerCase();
      const relativePath = path.relative(process.cwd(), fullPath);

      if (imgExts.includes(ext)) {
        slides.push({ order: slides.length, image_path: relativePath });
      } else if (audioExts.includes(ext) && !audioPath) {
        audioPath = relativePath;
      } else if (textExts.includes(ext) && !transcript) {
        try { transcript = fs.readFileSync(fullPath, 'utf8'); } catch {}
      }
    }

    const info = db.prepare(
      `INSERT INTO speeches (title, conference, speaker, speech_date, transcript, audio_path) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(title, conference || null, speaker || null, speechDate || null, transcript, audioPath);

    const speechId = info.lastInsertRowid as number;

    const insertSlide = db.prepare(`INSERT INTO speech_slides (speech_id, slide_order, image_path) VALUES (?, ?, ?)`);
    for (const slide of slides) {
      insertSlide.run(speechId, slide.order, slide.image_path);
    }

    if (tagsStr) {
      const insertTag = db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`);
      const getTag = db.prepare(`SELECT id FROM tags WHERE name = ?`);
      const linkTag = db.prepare(`INSERT OR IGNORE INTO speech_tags (speech_id, tag_id) VALUES (?, ?)`);
      for (const name of tagsStr.split(',').map(t => t.trim()).filter(Boolean)) {
        insertTag.run(name);
        const tagId = (getTag.get(name) as any).id;
        linkTag.run(speechId, tagId);
      }
    }

    return NextResponse.json({
      id: speechId, slidesCount: slides.length, hasAudio: !!audioPath, hasTranscript: !!transcript,
    }, { status: 201 });
  } catch (err) {
    console.error('Upload failed:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
