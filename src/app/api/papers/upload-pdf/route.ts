import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { analyzeAndStore } from '@/lib/ai-helpers';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const topicId = formData.get('topic_id') as string | null;
    const tagsStr = formData.get('tags') as string | null;

    if (!file) return NextResponse.json({ error: 'PDF file is required' }, { status: 400 });
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 });
    }

    // Save PDF file
    const papersDir = path.join(process.cwd(), 'uploads', 'papers');
    fs.mkdirSync(papersDir, { recursive: true });
    const pdfFileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const pdfFilePath = path.join(papersDir, pdfFileName);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(pdfFilePath, buffer);
    const pdfPath = `papers/${pdfFileName}`;

    // Extract text from PDF
    let extractedText = '';
    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      extractedText = data.text || '';
    } catch (err) {
      console.error('PDF parse error:', err);
    }

    // Heuristic metadata extraction
    const { title, authors, abstract, keywords } = extractMetadata(extractedText);

    const db = getDb();
    const info = db.prepare(
      `INSERT INTO academic_papers (title, authors, abstract, content, keywords, url, pdf_path, topic_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      title,
      authors || null,
      abstract || null,
      extractedText || null,
      keywords || null,
      null,
      pdfPath,
      topicId ? parseInt(topicId) : null
    );

    const paperId = info.lastInsertRowid as number;

    // Tags
    if (tagsStr) {
      const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
      const getTag = db.prepare('SELECT id FROM tags WHERE name = ?');
      const linkTag = db.prepare('INSERT OR IGNORE INTO paper_tags (paper_id, tag_id) VALUES (?, ?)');
      for (const name of tagsStr.split(',').map(t => t.trim()).filter(Boolean)) {
        insertTag.run(name);
        const tagId = (getTag.get(name) as any).id;
        linkTag.run(paperId, tagId);
      }
    }

    // Fire-and-forget AI analysis
    if (extractedText || abstract) {
      analyzeAndStore('paper', paperId).catch(err =>
        console.error('Background AI analysis failed:', err)
      );
    }

    return NextResponse.json({
      id: paperId,
      title,
      authors,
      abstract: abstract ? abstract.substring(0, 300) + '...' : null,
      keywords,
      textLength: extractedText.length,
      pdfPath,
    }, { status: 201 });
  } catch (err) {
    console.error('PDF upload failed:', err);
    return NextResponse.json({ error: 'PDF upload failed' }, { status: 500 });
  }
}

function extractMetadata(text: string): {
  title: string;
  authors: string | null;
  abstract: string | null;
  keywords: string | null;
} {
  if (!text.trim()) {
    return { title: 'Untitled Paper', authors: null, abstract: null, keywords: null };
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let title = 'Untitled Paper';
  let authors: string | null = null;
  let abstract: string | null = null;
  let keywords: string | null = null;

  // Noise prefixes for skipping non-title lines
  const noisePrefixes = /^(provided|copyright|permission|granted|reproduce|all rights|http|www|doi|arxiv|submitted|accepted|published|journal|conference|proceedings|vol\.|pp\.|pages?\s)/i;

  // Title detection: find first line that looks like an academic paper title
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const line = lines[i];
    if (line.length < 20 || line.length > 300) continue;
    if (/@/.test(line)) continue;
    if (noisePrefixes.test(line)) continue;
    // Skip continuation lines (start with lowercase)
    if (/^[a-z]/.test(line)) continue;
    // Must have at least 3 words
    const words = line.split(/\s+/).filter(w => w.length > 0);
    if (words.length < 3) continue;
    // At least 50% of words should start uppercase (typical for English titles)
    const capitalized = words.filter(w => /^[A-Z\u4e00-\u9fff]/.test(w)).length;
    if (capitalized / words.length < 0.4) continue;

    title = line.replace(/\s+/g, ' ').trim();
    break;
  }

  // Abstract: between "Abstract" and "Introduction"/"Keywords"/"1."
  const abstractMatch = text.match(/abstract[\s]*\n([\s\S]{30,5000}?)(?:\n\s*(?:introduction|keywords?|1[\.\s]))/i);
  if (abstractMatch) {
    abstract = abstractMatch[1].replace(/\s+/g, ' ').trim();
  }

  // Keywords: after "Keywords:"
  const kwMatch = text.match(/keywords?[:\s]+([\s\S]{5,500}?)(?:\n\n|\n\s*(?:introduction|1[\.\s]))/i);
  if (kwMatch) {
    keywords = kwMatch[1].replace(/\s+/g, ' ').trim();
  }

  // Authors: lines between title and abstract, containing person names
  const titleIdx = lines.findIndex(l => l.replace(/\s+/g, ' ').trim() === title);
  if (titleIdx >= 0) {
    const authorLines: string[] = [];
    for (let i = titleIdx + 1; i < Math.min(titleIdx + 25, lines.length); i++) {
      const line = lines[i];
      if (/^abstract\b/i.test(line)) break;
      if (/@/.test(line)) continue;
      if (noisePrefixes.test(line)) continue;
      if (line.length < 3 || line.length > 200) continue;
      // Skip pure affiliation lines
      if (/university|institute|department|laboratory|college|school of|research center|hospital|faculty/i.test(line)) continue;
      // Skip marker-only lines (*, †, etc.)
      if (line.replace(/[*†‡§¶,\s]/g, '').length < 3) continue;
      authorLines.push(line);
    }
    if (authorLines.length > 0) {
      authors = authorLines.join(', ').replace(/\s+/g, ' ').trim();
    }
  }

  return { title, authors, abstract, keywords };
}
