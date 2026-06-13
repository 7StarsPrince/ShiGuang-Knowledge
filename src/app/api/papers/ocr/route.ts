import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { chatVision, getVisionModel } from '@/lib/llm';
import { PDF_PAGE_OCR_PROMPT } from '@/lib/llm-prompt';
import { renderPdfPagesToBase64 } from '@/lib/pdf-to-images';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pdfPath, pageIndices } = body;

    if (!pdfPath || typeof pdfPath !== 'string') {
      return NextResponse.json({ error: '缺少 pdfPath' }, { status: 400 });
    }
    if (!Array.isArray(pageIndices) || pageIndices.length === 0) {
      return NextResponse.json({ error: '缺少 pageIndices' }, { status: 400 });
    }

    const resolved = path.resolve(UPLOADS_DIR, pdfPath);
    if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!fs.existsSync(resolved)) {
      return NextResponse.json({ error: 'PDF 文件不存在' }, { status: 404 });
    }

    if (!getVisionModel()) {
      return NextResponse.json({ error: '未配置 vision 模型，无法 OCR' }, { status: 400 });
    }

    const buffer = fs.readFileSync(resolved);
    const images = await renderPdfPagesToBase64(buffer, pageIndices, 200);

    const pages: Array<{ pageIndex: number; text: string }> = [];
    for (let i = 0; i < images.length; i++) {
      const pageIndex = pageIndices[i];
      try {
        const raw = await chatVision(
          PDF_PAGE_OCR_PROMPT,
          [images[i]],
          { json_mode: false, temperature: 0.2, max_tokens: 4096 }
        );
        const text = (raw || '').trim();
        pages.push({ pageIndex, text });
      } catch (err) {
        console.error(`OCR page ${pageIndex} failed:`, err);
        pages.push({ pageIndex, text: '' });
      }
    }

    const text = pages.map((p) => p.text).join('\n\n');
    return NextResponse.json({ text, pages });
  } catch (err) {
    console.error('PDF OCR failed:', err);
    return NextResponse.json({ error: 'PDF OCR 失败' }, { status: 500 });
  }
}
