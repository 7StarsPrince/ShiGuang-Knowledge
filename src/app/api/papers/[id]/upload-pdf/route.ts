import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = getDb();
    const paper = db.prepare('SELECT id, title FROM academic_papers WHERE id = ?').get(id) as any;
    if (!paper) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'PDF file is required' }, { status: 400 });
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Save PDF
    const papersDir = path.join(process.cwd(), 'uploads', 'papers');
    fs.mkdirSync(papersDir, { recursive: true });
    const pdfFileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    fs.writeFileSync(path.join(papersDir, pdfFileName), buffer);
    const pdfPath = `papers/${pdfFileName}`;

    // Extract text
    let extractedText = '';
    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      extractedText = data.text || '';
    } catch (err) {
      console.error('PDF parse error:', err);
    }

    // Merge into existing paper: update content and pdf_path, keep existing metadata
    const updates: string[] = ['pdf_path = ?', "updated_at = datetime('now')"];
    const values: any[] = [pdfPath];

    if (extractedText) {
      updates.push('content = ?');
      values.push(extractedText);
    }

    // If abstract is empty, try to extract from PDF
    const currentPaper = db.prepare('SELECT abstract FROM academic_papers WHERE id = ?').get(id) as any;
    if (!currentPaper.abstract && extractedText) {
      const abstractMatch = extractedText.match(/abstract[:\s]*\n?([\s\S]{50,3000}?)(?:\n\s*(?:introduction|keywords?|1[\.\s]))/i);
      if (abstractMatch) {
        updates.push('abstract = ?');
        values.push(abstractMatch[1].replace(/\s+/g, ' ').trim());
      }
    }

    values.push(id);
    db.prepare(`UPDATE academic_papers SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    return NextResponse.json({
      id: parseInt(id),
      title: paper.title,
      textLength: extractedText.length,
      pdfPath,
    });
  } catch (err: any) {
    console.error('PDF merge failed:', err);
    return NextResponse.json({ error: err.message || 'PDF upload failed' }, { status: 500 });
  }
}
