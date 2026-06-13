import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { analyzeAndStore } from '@/lib/ai-helpers';
import { chat, chatVision, getVisionModel } from '@/lib/llm';
import { PDF_METADATA_PROMPT, PDF_VISION_OCR_PROMPT, PdfMetadata } from '@/lib/llm-prompt';
import { renderPdfPagesToBase64 } from '@/lib/pdf-to-images';
import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'papers');

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // Step 1: preview
      const formData = await req.formData();
      const file = formData.get('file') as File;
      if (!file) {
        return NextResponse.json({ error: '请选择 PDF 文件' }, { status: 400 });
      }
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        return NextResponse.json({ error: '仅支持 PDF 文件' }, { status: 400 });
      }

      // Save file
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      const pdfFileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const pdfFilePath = path.join(UPLOAD_DIR, pdfFileName);
      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(pdfFilePath, buffer);
      const pdfPath = `papers/${pdfFileName}`;

      // Extract text and page count
      let extractedText = '';
      let numPages = 1;
      try {
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(buffer);
        extractedText = data.text || '';
        numPages = data.numpages || 1;
      } catch (err) {
        console.error('PDF parse error:', err);
        return NextResponse.json({ error: '无法解析 PDF，文件可能损坏' }, { status: 400 });
      }

      // Extract metadata via LLM (vision OCR for scanned PDFs)
      const { meta, method } = await extractMetadataRobust(buffer, extractedText, numPages);

      return NextResponse.json({
        preview: {
          ...meta,
          pdfPath,
          textLength: extractedText.length,
          _extractionMethod: method,
        },
      });
    }

    // Step 2: import (JSON)
    const body = await req.json();
    const { action, title, authors, journal, year, doi, abstract, keywords, pdfPath, topic_id, tags } = body;

    if (action !== 'import') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    if (!title?.trim()) {
      return NextResponse.json({ error: '标题不能为空' }, { status: 400 });
    }
    if (!pdfPath) {
      return NextResponse.json({ error: '缺少 pdfPath' }, { status: 400 });
    }

    const fullPath = path.join(process.cwd(), 'uploads', pdfPath);
    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ error: 'PDF 文件不存在，请重新上传' }, { status: 400 });
    }

    const db = getDb();
    const info = db.prepare(
      `INSERT INTO academic_papers (title, authors, abstract, content, journal, year, doi, url, keywords, topic_id, pdf_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      title.trim(),
      authors?.trim() || null,
      abstract?.trim() || null,
      null,
      journal?.trim() || null,
      year?.trim() || null,
      doi?.trim() || null,
      doi?.trim() ? `https://doi.org/${doi.trim()}` : null,
      keywords?.trim() || null,
      topic_id ? parseInt(topic_id) : null,
      pdfPath
    );

    const paperId = info.lastInsertRowid as number;

    if (tags && Array.isArray(tags) && tags.length > 0) {
      const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
      const getTag = db.prepare('SELECT id FROM tags WHERE name = ?');
      const linkTag = db.prepare('INSERT OR IGNORE INTO paper_tags (paper_id, tag_id) VALUES (?, ?)');
      for (const name of tags) {
        const trimmed = String(name).trim();
        if (!trimmed) continue;
        insertTag.run(trimmed);
        const tag = getTag.get(trimmed) as any;
        if (tag) linkTag.run(paperId, tag.id);
      }
    }

    if (abstract) {
      analyzeAndStore('paper', paperId).catch(err =>
        console.error('Background AI analysis failed:', err)
      );
    }

    return NextResponse.json({
      id: paperId,
      title: title.trim(),
      authors: authors?.trim() || null,
      journal: journal?.trim() || null,
      year: year?.trim() || null,
      doi: doi?.trim() || null,
    }, { status: 201 });
  } catch (err) {
    console.error('PDF import failed:', err);
    return NextResponse.json({ error: 'PDF 导入失败' }, { status: 500 });
  }
}

async function extractMetadataRobust(
  buffer: Buffer,
  extractedText: string,
  numPages: number
): Promise<{ meta: PdfMetadata; method: 'vision' | 'text' }> {
  const isScanned = extractedText.trim().length < 200;

  if (isScanned && getVisionModel()) {
    try {
      const images = await renderPdfPagesToBase64(buffer, [0, 1], 150);
      const raw = await chatVision(
        PDF_VISION_OCR_PROMPT,
        images,
        { json_mode: true, temperature: 0.2, max_tokens: 4096 }
      );
      return { meta: parsePdfMetadata(raw), method: 'vision' };
    } catch (err) {
      console.error('Vision OCR failed, falling back to text LLM:', err);
    }
  }

  // Text-based PDF: always use LLM
  const input = extractedText.replace(/\s+/g, ' ').trim().slice(0, 12000);
  if (!input.trim()) {
    return {
      meta: { title: '', authors: '', journal: '', year: '', doi: '', abstract: '', keywords: '' },
      method: 'text',
    };
  }

  const raw = await chat(
    [
      { role: 'system', content: PDF_METADATA_PROMPT },
      { role: 'user', content: input },
    ],
    { json_mode: true, temperature: 0.2, max_tokens: 2048 }
  );
  return { meta: parsePdfMetadata(raw), method: 'text' };
}

function parsePdfMetadata(raw: string): PdfMetadata {
  const parsed = JSON.parse(raw);
  return {
    title: typeof parsed.title === 'string' ? parsed.title.trim() : '',
    authors: typeof parsed.authors === 'string' ? parsed.authors.trim() : '',
    journal: typeof parsed.journal === 'string' ? parsed.journal.trim() : '',
    year: typeof parsed.year === 'string' ? parsed.year.trim() : '',
    doi: typeof parsed.doi === 'string' ? parsed.doi.trim() : '',
    abstract: typeof parsed.abstract === 'string' ? parsed.abstract.trim() : '',
    keywords: typeof parsed.keywords === 'string' ? parsed.keywords.trim() : '',
  };
}
