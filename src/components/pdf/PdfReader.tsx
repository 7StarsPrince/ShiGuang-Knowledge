'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import ContextMenu from './ContextMenu';
import SidePanel from './SidePanel';
import TTSControls from './TTSControls';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfReaderProps {
  pdfPath: string;
  title: string;
  onExit: () => void;
  onSaveToNotes?: (text: string, source: string, mode: 'translate' | 'explain' | 'ocr') => void;
}

interface SidePanelState {
  mode: 'translate' | 'explain' | 'ocr';
  content: string;
  loading: boolean;
  selectedText: string;
  saved: boolean;
}

export default function PdfReader({ pdfPath, title, onExit, onSaveToNotes }: PdfReaderProps) {
  const [numPages, setNumPages] = useState(0);
  const [pageWidth, setPageWidth] = useState(800);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; text: string } | null>(null);
  const [sidePanel, setSidePanel] = useState<SidePanelState | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [ocrCache, setOcrCache] = useState<Map<number, string>>(new Map());
  const [ocrLoading, setOcrLoading] = useState(false);
  const [textCache, setTextCache] = useState<Map<number, string>>(new Map());
  const [textLoading, setTextLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const pageVisibilityRef = useRef<Map<number, number>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const pdfDocumentRef = useRef<any>(null);

  // Fetch PDF data with abort controller to avoid pdfjs range-stream abort errors on unmount
  useEffect(() => {
    const controller = new AbortController();
    setPdfData(null);
    setPdfLoadError(null);

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
        setPdfLoadError(err.message || '加载失败');
      });

    return () => controller.abort();
  }, [pdfPath]);

  const fileProp = useMemo(() => (pdfData ? { data: pdfData } : null), [pdfData]);

  // Calculate page width based on container and side panel
  useEffect(() => {
    const updateWidth = () => {
      const vw = window.innerWidth;
      const panelW = sidePanel ? 420 : 0;
      setPageWidth(vw - panelW - 80);
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [sidePanel]);

  // Cleanup TTS on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  // Track currently visible page via IntersectionObserver
  useEffect(() => {
    if (typeof window === 'undefined' || numPages === 0) return;

    const container = containerRef.current;
    if (!container) return;

    pageVisibilityRef.current = new Map();
    observerRef.current?.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const idx = Number((entry.target as HTMLElement).dataset.pageIndex);
          pageVisibilityRef.current.set(idx, entry.intersectionRatio);
        });

        // Pick page with highest visibility ratio
        let bestIdx = 0;
        let bestRatio = -1;
        pageVisibilityRef.current.forEach((ratio, idx) => {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestIdx = idx;
          }
        });
        setCurrentPage(bestIdx);
      },
      { root: container, threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    const wrappers = container.querySelectorAll('[data-page-index]');
    wrappers.forEach((el) => observerRef.current?.observe(el));

    return () => observerRef.current?.disconnect();
  }, [numPages]);

  // OCR: ensure the requested page has recognized text, return it
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

  // Get selected text, current page text, or OCR fallback
  const getActiveText = useCallback(async (): Promise<string | null> => {
    const selection = window.getSelection()?.toString().trim() || '';
    if (selection) return selection;
    const text = await extractPageText(currentPage);
    if (text) return text;
    return ensureOcr(currentPage);
  }, [currentPage, extractPageText, ensureOcr]);

  // Right-click handler
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const selection = window.getSelection();
    const text = selection?.toString().trim() || '';
    if (text.length > 0) {
      setContextMenu({ x: e.clientX, y: e.clientY, text });
    } else {
      setContextMenu(null);
    }
  }, []);

  // Close context menu
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // TTS: speak selected text
  const handleTTS = useCallback((text: string) => {
    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    // Detect if text is mostly Chinese
    const zhChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const enChars = (text.match(/[a-zA-Z]/g) || []).length;
    utterance.lang = zhChars > enChars ? 'zh-CN' : 'en-US';
    utterance.rate = 0.9;

    // Try to find a matching voice
    const voices = synth.getVoices();
    const langPrefix = utterance.lang.split('-')[0];
    const matchVoice = voices.find(v => v.lang.startsWith(langPrefix));
    if (matchVoice) utterance.voice = matchVoice;

    utterance.onend = () => { setSpeaking(false); setPaused(false); };
    utterance.onerror = () => { setSpeaking(false); setPaused(false); };

    utteranceRef.current = utterance;
    synth.speak(utterance);
    setSpeaking(true);
    setPaused(false);
  }, []);

  // TTS controls
  const handlePause = useCallback(() => {
    window.speechSynthesis.pause();
    setPaused(true);
  }, []);

  const handleResume = useCallback(() => {
    window.speechSynthesis.resume();
    setPaused(false);
  }, []);

  const handleStop = useCallback(() => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
  }, []);

  // Translate selected text
  const handleTranslate = useCallback(async (text: string) => {
    setSidePanel({ mode: 'translate', content: '', loading: true, selectedText: text, saved: false });
    try {
      const res = await fetch('/api/papers/translate-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSidePanel(prev => prev ? { ...prev, content: data.translation, loading: false } : null);
    } catch (err) {
      setSidePanel(prev => prev ? { ...prev, content: '翻译失败，请重试', loading: false } : null);
    }
  }, []);

  // Explain selected text
  const handleExplain = useCallback(async (text: string) => {
    setSidePanel({ mode: 'explain', content: '', loading: true, selectedText: text, saved: false });
    try {
      const res = await fetch('/api/papers/explain-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, title }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSidePanel(prev => prev ? { ...prev, content: data.explanation, loading: false } : null);
    } catch (err) {
      setSidePanel(prev => prev ? { ...prev, content: '解释失败，请重试', loading: false } : null);
    }
  }, [title]);

  const NO_TEXT_MESSAGE = '未识别到文字。PDF 为文字版时，当前页无文字可提取；PDF 为扫描版时，请点击「OCR」按钮识别当前页。';

  // Toolbar actions: use selection if any, otherwise current page text, otherwise OCR
  const handleToolbarTranslate = useCallback(async () => {
    const text = await getActiveText();
    if (!text) { alert(NO_TEXT_MESSAGE); return; }
    handleTranslate(text);
  }, [getActiveText, handleTranslate]);

  const handleToolbarTTS = useCallback(async () => {
    const text = await getActiveText();
    if (!text) { alert(NO_TEXT_MESSAGE); return; }
    handleTTS(text);
  }, [getActiveText, handleTTS]);

  const handleToolbarExplain = useCallback(async () => {
    const text = await getActiveText();
    if (!text) { alert(NO_TEXT_MESSAGE); return; }
    handleExplain(text);
  }, [getActiveText, handleExplain]);

  const handleToolbarOcr = useCallback(async () => {
    setSidePanel({ mode: 'ocr', content: '', loading: true, selectedText: `第 ${currentPage + 1} 页`, saved: false });
    const text = await ensureOcr(currentPage);
    if (!text) {
      setSidePanel(prev => prev ? { ...prev, content: 'OCR 未识别到文字', loading: false } : null);
      return;
    }
    setSidePanel(prev => prev ? { ...prev, content: text, loading: false } : null);
  }, [currentPage, ensureOcr]);

  const handleSaveCurrentPanel = useCallback(() => {
    if (!sidePanel || !onSaveToNotes) return;
    onSaveToNotes(sidePanel.content, sidePanel.selectedText, sidePanel.mode);
    setSidePanel(prev => prev ? { ...prev, saved: true } : null);
  }, [sidePanel, onSaveToNotes]);

  const selectedTextForMenu = contextMenu?.text || '';

  return (
    <div className="fixed inset-0 z-[100] bg-[#1a1a1a] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-800/40 bg-[#1a1a1a] shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onExit} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            退出阅读
          </button>
          <div className="w-px h-4 bg-gray-700/50" />
          <h1 className="text-sm text-gray-300 truncate">{title}</h1>
          {numPages > 0 && <span className="text-[10px] text-gray-600 shrink-0">{numPages} 页</span>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleToolbarTranslate}
            disabled={ocrLoading || textLoading}
            title="翻译选中内容或当前页"
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] bg-gray-800/60 hover:bg-gray-700/60 text-gray-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] bg-gray-800/60 hover:bg-gray-700/60 text-gray-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] bg-gray-800/60 hover:bg-gray-700/60 text-gray-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] bg-amber-900/30 hover:bg-amber-900/50 text-amber-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="w-px h-4 bg-gray-700/50" />
          <TTSControls speaking={speaking} paused={paused} onPause={handlePause} onResume={handleResume} onStop={handleStop} />
          {!sidePanel && (
            <button
              onClick={() => setSidePanel({ mode: 'ocr', content: '', loading: false, selectedText: '', saved: false })}
              className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              打开侧栏
            </button>
          )}
          {sidePanel && (
            <button onClick={() => setSidePanel(null)} className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors">
              关闭侧栏
            </button>
          )}
        </div>
      </div>

      {/* Main content: PDF + optional side panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: PDF */}
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto bg-[#525659]"
          onContextMenu={handleContextMenu}
        >
          <div className="p-5 flex flex-col items-center gap-4">
            {pdfLoadError ? (
              <p className="text-red-400 text-sm py-8">PDF 加载失败：{pdfLoadError}</p>
            ) : (
              <Document
                file={fileProp}
                onLoadSuccess={(doc) => {
                  setNumPages(doc.numPages);
                  pdfDocumentRef.current = doc;
                }}
                onLoadError={(err) => console.error('PDF reader load error:', err)}
                loading={<p className="text-gray-400 text-sm py-8">加载 PDF 中...</p>}
              >
                {Array.from({ length: numPages }, (_, i) => (
                  <div key={i} data-page-index={i} className="shadow-lg">
                    <Page pageNumber={i + 1} width={pageWidth} />
                  </div>
                ))}
              </Document>
            )}
          </div>
        </div>

        {/* Right: Side panel */}
        {sidePanel && (
          <SidePanel
            mode={sidePanel.mode}
            content={sidePanel.content}
            loading={sidePanel.loading}
            selectedText={sidePanel.selectedText}
            onClose={() => setSidePanel(null)}
            onSaveToNotes={onSaveToNotes ? handleSaveCurrentPanel : undefined}
            saved={sidePanel.saved}
          />
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onTranslate={() => handleTranslate(selectedTextForMenu)}
          onTTS={() => handleTTS(selectedTextForMenu)}
          onExplain={() => handleExplain(selectedTextForMenu)}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}
