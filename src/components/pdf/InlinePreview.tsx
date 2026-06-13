'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface InlinePdfPreviewProps {
  pdfPath: string;
  onAction?: (action: 'translate' | 'tts' | 'explain' | 'ocr', text: string) => void;
  onOcrText?: (text: string) => void;
}

export default function InlinePdfPreview({ pdfPath, onAction, onOcrText }: InlinePdfPreviewProps) {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrCache, setOcrCache] = useState<Map<number, string>>(new Map());
  const [textCache, setTextCache] = useState<Map<number, string>>(new Map());
  const [textLoading, setTextLoading] = useState(false);
  const [pageWidth, setPageWidth] = useState(800);

  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocumentRef = useRef<any>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setPageWidth(Math.max(240, el.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setPdfData(null);
    setLoadError(null);

    fetch(`/api/uploads/${pdfPath}`, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then(data => {
        // Copy the buffer so react-pdf/pdfjs internal transfers don't detach our source.
        setPdfData(data.slice(0));
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        setLoadError(err.message || '加载失败');
      });

    return () => controller.abort();
  }, [pdfPath]);

  const fileProp = useMemo(() => (pdfData ? { data: pdfData } : null), [pdfData]);

  const extractPageText = useCallback(async (pageIndex: number): Promise<string | null> => {
    const cached = textCache.get(pageIndex);
    if (cached !== undefined) return cached || null;

    setTextLoading(true);
    try {
      const doc = pdfDocumentRef.current;
      if (!doc) return null;
      const page = await doc.getPage(pageIndex + 1);
      const content = await page.getTextContent();
      const items = (content.items as any[]).map((item: any) => item.str).join(' ');
      const text = items.trim();
      setTextCache((prev) => new Map(prev).set(pageIndex, text));
      return text || null;
    } catch (err) {
      console.error('Extract page text failed:', err);
      return null;
    } finally {
      setTextLoading(false);
    }
  }, [textCache]);

  const ensureOcr = useCallback(async (pageIndex: number): Promise<string | null> => {
    const cached = ocrCache.get(pageIndex);
    if (cached !== undefined) return cached || null;

    setOcrLoading(true);
    try {
      const res = await fetch('/api/papers/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfPath, pageIndices: [pageIndex] }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const text = (data.text || '').trim();
      setOcrCache((prev) => new Map(prev).set(pageIndex, text));
      return text || null;
    } catch (err) {
      console.error('OCR failed:', err);
      return null;
    } finally {
      setOcrLoading(false);
    }
  }, [ocrCache, pdfPath]);

  const getActiveText = useCallback(async (): Promise<string | null> => {
    const selection = window.getSelection()?.toString().trim() || '';
    if (selection) return selection;
    const text = await extractPageText(currentPage - 1);
    if (text) return text;
    return ensureOcr(currentPage - 1);
  }, [currentPage, extractPageText, ensureOcr]);

  const NO_TEXT_MESSAGE = '未识别到文字。PDF 为文字版时，当前页无文字可提取；PDF 为扫描版时，请点击「OCR」按钮识别当前页。';

  const handleToolbarTranslate = useCallback(async () => {
    const text = await getActiveText();
    if (!text) { alert(NO_TEXT_MESSAGE); return; }
    onAction?.('translate', text);
  }, [getActiveText, onAction]);

  const handleToolbarTTS = useCallback(async () => {
    const text = await getActiveText();
    if (!text) { alert(NO_TEXT_MESSAGE); return; }
    onAction?.('tts', text);
  }, [getActiveText, onAction]);

  const handleToolbarExplain = useCallback(async () => {
    const text = await getActiveText();
    if (!text) { alert(NO_TEXT_MESSAGE); return; }
    onAction?.('explain', text);
  }, [getActiveText, onAction]);

  const handleToolbarOcr = useCallback(async () => {
    const pageIndex = currentPage - 1;
    const text = await ensureOcr(pageIndex);
    if (!text) { alert('OCR 未识别到文字'); return; }
    onAction?.('ocr', text);
    onOcrText?.(text);
  }, [currentPage, ensureOcr, onAction, onOcrText]);

  if (loadError) {
    return <p className="text-red-400 text-sm py-8">PDF 加载失败：{loadError}</p>;
  }

  return (
    <div className="w-full">
      {/* Toolbar */}
      <div className="flex items-center justify-center gap-2 mb-3">
        <button
          onClick={handleToolbarTranslate}
          disabled={ocrLoading || textLoading}
          title="翻译选中内容或当前页"
          className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] bg-gray-800/80 hover:bg-gray-700/80 text-gray-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.5 1.5L11 9m-8 3h12m-5.5 0l-.5 1.5M12 12l-2 6m6-6l-2 6M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          翻译
        </button>
        <button
          onClick={handleToolbarTTS}
          disabled={ocrLoading || textLoading}
          title="朗读选中内容或当前页"
          className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] bg-gray-800/80 hover:bg-gray-700/80 text-gray-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
          朗读
        </button>
        <button
          onClick={handleToolbarExplain}
          disabled={ocrLoading || textLoading}
          title="AI 解释选中内容或当前页"
          className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] bg-gray-800/80 hover:bg-gray-700/80 text-gray-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          AI 解释
        </button>
        <button
          onClick={handleToolbarOcr}
          disabled={ocrLoading}
          title="OCR 识别当前页"
          className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] bg-amber-900/40 hover:bg-amber-900/60 text-amber-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {ocrLoading ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              OCR 中...
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
              </svg>
              OCR
            </>
          )}
        </button>
      </div>

      <div ref={containerRef}>
        <Document
          file={fileProp}
          onLoadSuccess={(doc) => {
            setNumPages(doc.numPages);
            pdfDocumentRef.current = doc;
          }}
          onLoadError={(err) => console.error('Inline PDF load error:', err)}
          loading={<p className="text-gray-400 text-sm py-8">加载 PDF 中...</p>}
        >
          <div className="shadow-lg">
            <Page pageNumber={currentPage} width={pageWidth} />
          </div>
        </Document>
      </div>
      {numPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-4">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="w-8 h-8 flex items-center justify-center bg-gray-700/50 hover:bg-gray-600/50 disabled:opacity-30 disabled:cursor-default rounded-lg text-gray-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-xs text-gray-400">{currentPage} / {numPages}</span>
          <button
            onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
            disabled={currentPage >= numPages}
            className="w-8 h-8 flex items-center justify-center bg-gray-700/50 hover:bg-gray-600/50 disabled:opacity-30 disabled:cursor-default rounded-lg text-gray-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
