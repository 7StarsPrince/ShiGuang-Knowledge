'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

const PdfReader = dynamic(() => import('@/components/pdf/PdfReader'), { ssr: false });
const InlinePdfPreview = dynamic(() => import('@/components/pdf/InlinePreview'), { ssr: false });

interface TopicOption { id: number; name: string; children: TopicOption[]; }

function flattenTopics(nodes: TopicOption[], depth = 0): Array<{ id: number; label: string }> {
  const result: Array<{ id: number; label: string }> = [];
  for (const node of nodes) {
    const indent = '\u00A0\u00A0'.repeat(depth);
    result.push({ id: node.id, label: depth > 0 ? `${indent}└ ${node.name}` : node.name });
    result.push(...flattenTopics(node.children, depth + 1));
  }
  return result;
}

function toTopicOption(t: any): TopicOption {
  return { id: t.id, name: t.name, children: (t.children || []).map((c: any) => toTopicOption(c)) };
}

interface Paper {
  id: number; title: string; authors: string; abstract: string; content: string;
  journal: string; year: string; doi: string; url: string; keywords: string;
  notes: string; topic_id: number | null; topic_name: string; tags?: string;
  pdf_path?: string; translation_zh?: string;
  ai_keywords?: string; ai_summary?: string; ai_entities?: string; ai_analyzed_at?: string;
}

function TextContent({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const MAX = 800;
  const needsCollapse = text.length > MAX;
  const display = expanded ? text : text.substring(0, MAX);

  return (
    <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-white mb-3">全文内容</h2>
      <p className="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap">{display}{needsCollapse && !expanded ? '...' : ''}</p>
      {needsCollapse && (
        <button onClick={() => setExpanded(!expanded)} className="mt-2 text-[11px] text-amber-400/70 hover:text-amber-400">
          {expanded ? '收起' : `展开全部 (${(text.length / 1000).toFixed(0)}k 字符)`}
        </button>
      )}
    </div>
  );
}

export default function PaperDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [paper, setPaper] = useState<Paper | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(searchParams.get('edit') === '1');
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [tagsInput, setTagsInput] = useState('');
  const [notes, setNotes] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [fetchingFulltext, setFetchingFulltext] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [sidePanelMode, setSidePanelMode] = useState<'translate' | 'explain' | 'ocr'>('translate');
  const [sidePanelContent, setSidePanelContent] = useState('');
  const [sidePanelLoading, setSidePanelLoading] = useState(false);
  const [sidePanelSelectedText, setSidePanelSelectedText] = useState('');
  const [sidePanelSaved, setSidePanelSaved] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [readingMode, setReadingMode] = useState(false);
  const pdfRef = useRef<HTMLInputElement>(null);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Save AI analysis to notes
  const handleSaveAiToNotes = useCallback(async () => {
    if (!paper) return;
    const aiKw = paper.ai_keywords ? JSON.parse(paper.ai_keywords) : [];
    const aiEnt = paper.ai_entities ? JSON.parse(paper.ai_entities) : {};
    const entCategories = [
      { key: 'companies', label: '公司' },
      { key: 'drugs', label: '药品' },
      { key: 'people', label: '人物' },
      { key: 'organizations', label: '机构' },
      { key: 'diseases', label: '疾病' },
      { key: 'mechanisms', label: '靶点/机制' },
    ];

    const lines: string[] = [];
    if (paper.ai_summary) {
      lines.push('【AI 摘要】');
      lines.push(paper.ai_summary);
      lines.push('');
    }
    if (aiKw.length > 0) {
      lines.push('【AI 关键词】');
      lines.push(aiKw.join(', '));
      lines.push('');
    }
    const entityLines = entCategories
      .map(({ key, label }) => {
        const items = aiEnt[key] || [];
        if (items.length === 0) return null;
        return `【${label}】\n${items.join(', ')}`;
      })
      .filter(Boolean) as string[];
    if (entityLines.length > 0) {
      lines.push('【AI 实体识别】');
      lines.push(entityLines.join('\n\n'));
    }

    const newNotes = [notes, lines.join('\n')].filter(Boolean).join('\n\n');
    setNotes(newNotes);

    try {
      await fetch(`/api/papers/${paper.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: newNotes }),
      });
      // Refresh paper to reflect persisted notes
      fetch(`/api/papers/${params.id}`).then(r => r.json()).then(data => {
        setPaper(data);
        setNotes(data.notes || '');
      });
    } catch (err) {
      console.error('Save AI notes failed:', err);
      alert('保存 AI 笔记失败');
    }
  }, [notes, paper, params.id]);

  const openSidePanel = (mode: 'translate' | 'explain' | 'ocr', selectedText: string, loading = true) => {
    setSidePanelMode(mode);
    setSidePanelSelectedText(selectedText);
    setSidePanelLoading(loading);
    setSidePanelContent('');
    setSidePanelSaved(false);
    setSidePanelOpen(true);
  };

  const handleSaveSidePanelToNotes = useCallback(async () => {
    if (!paper) return;
    const prefix = sidePanelMode === 'translate' ? '【翻译】' : sidePanelMode === 'explain' ? '【AI 解释】' : '【OCR 识别】';
    const source = sidePanelMode === 'ocr' ? `来源：${sidePanelSelectedText}` : `原文：${sidePanelSelectedText}`;
    const block = [prefix, source, sidePanelContent].join('\n');
    const newNotes = [notes, block].filter(Boolean).join('\n\n');
    setNotes(newNotes);
    try {
      await fetch(`/api/papers/${paper.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: newNotes }),
      });
      fetch(`/api/papers/${params.id}`).then(r => r.json()).then(data => {
        setPaper(data);
        setNotes(data.notes || '');
      });
      setSidePanelSaved(true);
    } catch (err) {
      console.error('Save side panel notes failed:', err);
      alert('保存到笔记失败');
    }
  }, [notes, paper, params.id, sidePanelContent, sidePanelMode, sidePanelSelectedText]);

  const handleInlineAction = useCallback(async (action: 'translate' | 'tts' | 'explain' | 'ocr', text: string) => {
    if (!paper) return;

    if (action === 'tts') {
      const synth = window.speechSynthesis;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const zhChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
      const enChars = (text.match(/[a-zA-Z]/g) || []).length;
      utterance.lang = zhChars > enChars ? 'zh-CN' : 'en-US';
      utterance.rate = 0.9;
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
      return;
    }

    if (action === 'ocr') {
      openSidePanel('ocr', '当前页 OCR', false);
      setSidePanelContent(text);
      return;
    }

    openSidePanel(action, text);
    try {
      const url = action === 'translate' ? '/api/papers/translate-selection' : '/api/papers/explain-selection';
      const body = action === 'translate' ? { text } : { text, title: paper.title };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSidePanelContent(action === 'translate' ? data.translation : data.explanation);
    } catch (err) {
      setSidePanelContent(action === 'translate' ? '翻译失败，请重试' : '解释失败，请重试');
    } finally {
      setSidePanelLoading(false);
    }
  }, [paper]);

  const handleStopTTS = useCallback(() => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
  }, []);

  const handlePauseTTS = useCallback(() => {
    window.speechSynthesis.pause();
    setPaused(true);
  }, []);

  const handleResumeTTS = useCallback(() => {
    window.speechSynthesis.resume();
    setPaused(false);
  }, []);

  // Cleanup TTS on unmount
  useEffect(() => {
    return () => { window.speechSynthesis?.cancel(); };
  }, []);

  // Load existing AI analysis from DB on mount
  useEffect(() => {
    if (paper?.ai_summary || paper?.ai_keywords) {
      setAnalyzing(false);
    }
  }, [paper?.ai_summary, paper?.ai_keywords]);

  useEffect(() => {
    fetch(`/api/papers/${params.id}`).then(r => r.json()).then(data => {
      setPaper(data);
      setTagsInput(data.tags || '');
      setNotes(data.notes || '');
      setTranslation(data.translation_zh || null);
      setLoading(false);
    }).catch(() => setLoading(false));
    fetch('/api/topics').then(r => r.json()).then((data: any[]) => setTopics(data.map(t => toTopicOption(t))));
  }, [params.id]);

  const handleFieldChange = (field: string, value: any) => {
    setPaper(prev => prev ? { ...prev, [field]: value } : prev);
  };

  const handleSave = async () => {
    if (!paper) return;
    const tags = tagsInput.split(/[,，]/).map(t => t.trim()).filter(Boolean);
    await fetch(`/api/papers/${paper.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...paper, notes, tags }),
    });
    setEditing(false);
    fetch(`/api/papers/${params.id}`).then(r => r.json()).then(data => setPaper(data));
  };

  const handleDelete = async () => {
    if (!confirm('确定要删除这篇论文吗？')) return;
    await fetch(`/api/papers/${paper!.id}`, { method: 'DELETE' });
    router.push('/papers');
  };

  const handleAnalyze = async () => {
    if (!paper || analyzing) return;
    setAnalyzing(true);
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: 'paper', contentId: paper.id }),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      setPaper(prev => prev ? {
        ...prev,
        ai_keywords: JSON.stringify(data.keywords),
        ai_summary: data.summary,
        ai_entities: JSON.stringify(data.entities),
        ai_analyzed_at: new Date().toISOString(),
      } : prev);
    } catch (err) {
      console.error('AI analyze failed:', err);
      alert('AI 分析失败');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleTranslate = async () => {
    if (!paper || translating) return;
    setTranslating(true);
    try {
      const res = await fetch(`/api/papers/${paper.id}/translate`, { method: 'POST' });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      setTranslation(data.translation);
    } catch (err) {
      console.error('Translation failed:', err);
      alert('翻译失败');
    } finally {
      setTranslating(false);
    }
  };

  const handleFetchFulltext = async () => {
    if (!paper || fetchingFulltext) return;
    setFetchingFulltext(true);
    try {
      const res = await fetch(`/api/papers/${paper.id}/fetch-fulltext`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        fetch(`/api/papers/${paper.id}`).then(r => r.json()).then(d => setPaper(d));
      } else {
        alert(data.error || '获取全文失败');
      }
    } catch {
      alert('获取全文失败');
    } finally {
      setFetchingFulltext(false);
    }
  };

  const handleUploadPdf = async (file: File) => {
    if (!paper || uploadingPdf) return;
    setUploadingPdf(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch(`/api/papers/${paper.id}/upload-pdf`, { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) {
        fetch(`/api/papers/${paper.id}`).then(r => r.json()).then(d => setPaper(d));
      } else {
        alert(data.error || '上传失败');
      }
    } catch { alert('上传失败'); }
    setUploadingPdf(false);
  };

  const handleCancelEdit = () => {
    fetch(`/api/papers/${params.id}`).then(r => r.json()).then(data => {
      setPaper(data);
      setTagsInput(data.tags || '');
      setNotes(data.notes || '');
    });
    setEditing(false);
  };

  if (loading) return <div className="text-center py-16 text-gray-500">Loading...</div>;
  if (!paper) return <div className="text-center py-16 text-gray-500">未找到</div>;

  // Reading mode: full-screen PDF reader
  if (readingMode && paper.pdf_path) {
    return (
      <PdfReader
        pdfPath={paper.pdf_path}
        title={paper.title}
        onExit={() => setReadingMode(false)}
        onSaveToNotes={(text, source, mode) => {
          const prefix = mode === 'translate' ? '【翻译】' : mode === 'explain' ? '【AI 解释】' : '【OCR 识别】';
          const srcLine = mode === 'ocr' ? `来源：${source}` : `原文：${source}`;
          const block = [prefix, srcLine, text].join('\n');
          const newNotes = [paper.notes, block].filter(Boolean).join('\n\n');
          setNotes(newNotes);
          fetch(`/api/papers/${paper.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: newNotes }),
          }).then(() => {
            fetch(`/api/papers/${params.id}`).then(r => r.json()).then(data => {
              setPaper(data);
              setNotes(data.notes || '');
            });
          });
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="max-w-4xl mx-auto flex items-start justify-between">
        <div>
          <button onClick={() => router.push('/papers')} className="text-xs text-gray-500 hover:text-gray-300 mb-2 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            返回列表
          </button>
          <h1 className="text-xl font-bold text-white">{paper.title}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-500">
            {paper.authors && <span>{paper.authors}</span>}
            {paper.journal && <span className="text-amber-400/70 italic">{paper.journal}</span>}
            {paper.year && <span>{paper.year}</span>}
            {paper.doi && <span className="text-blue-400/60">DOI: {paper.doi}</span>}
          </div>
          {(paper.topic_name || paper.tags) && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {paper.topic_name && <span className="text-[10px] px-2 py-0.5 bg-emerald-900/20 text-emerald-400/80 rounded">{paper.topic_name}</span>}
              {paper.tags && paper.tags.split(',').map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 bg-amber-900/20 text-amber-400/70 rounded">{t}</span>)}
            </div>
          )}
        </div>
        <div className="flex flex-nowrap gap-1.5 shrink-0">
          {editing ? (
            <>
              <button onClick={handleCancelEdit} className="px-2.5 py-1.5 text-[11px] bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg whitespace-nowrap">取消</button>
              <button onClick={handleSave} className="px-2.5 py-1.5 text-[11px] bg-amber-600 hover:bg-amber-700 text-white rounded-lg whitespace-nowrap">保存</button>
            </>
          ) : (
            <>
              {paper.pdf_path && (
                <button onClick={() => setReadingMode(true)} className="px-2.5 py-1.5 text-[11px] bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-400 rounded-lg whitespace-nowrap">阅读</button>
              )}
              {paper.url && <a href={paper.url} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1.5 text-[11px] bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg whitespace-nowrap">原文</a>}
              {paper.pdf_path && <a href={`/api/uploads/${paper.pdf_path}`} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1.5 text-[11px] bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg whitespace-nowrap">PDF</a>}
              <button onClick={() => setEditing(true)} className="px-2.5 py-1.5 text-[11px] bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg whitespace-nowrap">编辑</button>
              <button onClick={handleTranslate} disabled={translating}
                className={`px-2.5 py-1.5 text-[11px] rounded-lg transition-colors whitespace-nowrap ${translating ? 'bg-purple-900/30 text-purple-400/50 cursor-wait' : 'bg-purple-900/30 hover:bg-purple-900/50 text-purple-400'}`}>
                {translating ? '翻译中...' : translation ? '重译' : '翻译'}
              </button>
              {!paper.content && (
                <button onClick={handleFetchFulltext} disabled={fetchingFulltext}
                  className={`px-2.5 py-1.5 text-[11px] rounded-lg transition-colors whitespace-nowrap ${fetchingFulltext ? 'bg-teal-900/30 text-teal-400/50 cursor-wait' : 'bg-teal-900/30 hover:bg-teal-900/50 text-teal-400'}`}>
                  {fetchingFulltext ? '获取中...' : '全文'}
                </button>
              )}
              {!paper.content && (
                <button onClick={() => pdfRef.current?.click()} disabled={uploadingPdf}
                  className={`px-2.5 py-1.5 text-[11px] rounded-lg transition-colors whitespace-nowrap ${uploadingPdf ? 'bg-amber-900/30 text-amber-400/50 cursor-wait' : 'bg-amber-900/30 hover:bg-amber-900/50 text-amber-400'}`}>
                  {uploadingPdf ? '上传中...' : '传PDF'}
                  <input ref={pdfRef} type="file" accept=".pdf" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadPdf(f); }} />
                </button>
              )}
              <button onClick={handleAnalyze} disabled={analyzing}
                className={`px-2.5 py-1.5 text-[11px] rounded-lg transition-colors whitespace-nowrap ${analyzing ? 'bg-cyan-900/30 text-cyan-400/50 cursor-wait' : 'bg-cyan-900/30 hover:bg-cyan-900/50 text-cyan-400'}`}>
                {analyzing ? '分析中...' : 'AI分析'}
              </button>
              <button onClick={handleDelete} className="px-2.5 py-1.5 text-[11px] bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg whitespace-nowrap">删除</button>
            </>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
      {editing ? (
        <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-6 space-y-4">
          <div><label className="block text-xs text-gray-400 mb-1">标题</label>
            <input value={paper.title} onChange={e => handleFieldChange('title', e.target.value)} className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">作者（逗号分隔）</label>
              <input value={paper.authors || ''} onChange={e => handleFieldChange('authors', e.target.value)} className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">期刊/会议</label>
              <input value={paper.journal || ''} onChange={e => handleFieldChange('journal', e.target.value)} className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">年份</label>
              <input value={paper.year || ''} onChange={e => handleFieldChange('year', e.target.value)} className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">DOI</label>
              <input value={paper.doi || ''} onChange={e => handleFieldChange('doi', e.target.value)} className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">论文链接</label>
              <input value={paper.url || ''} onChange={e => handleFieldChange('url', e.target.value)} className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50" /></div>
          </div>
          <div><label className="block text-xs text-gray-400 mb-1">摘要</label>
            <textarea value={paper.abstract || ''} onChange={e => handleFieldChange('abstract', e.target.value)} rows={6} className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 text-xs text-gray-300 resize-y focus:outline-none focus:border-amber-500/50" /></div>
          <div><label className="block text-xs text-gray-400 mb-1">关键词（逗号分隔）</label>
            <input value={paper.keywords || ''} onChange={e => handleFieldChange('keywords', e.target.value)} className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50" /></div>
          <div><label className="block text-xs text-gray-400 mb-1">话题分类</label>
            <select value={paper.topic_id || ''} onChange={e => handleFieldChange('topic_id', e.target.value ? parseInt(e.target.value) : null)}
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50 appearance-none">
              <option value="">不选择话题</option>
              {flattenTopics(topics).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select></div>
          <div><label className="block text-xs text-gray-400 mb-1">标签（逗号分隔）</label>
            <input value={tagsInput} onChange={e => setTagsInput(e.target.value)} className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50" /></div>
          <div><label className="block text-xs text-gray-400 mb-1">个人笔记</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 text-xs text-gray-300 resize-y focus:outline-none focus:border-amber-500/50" /></div>
          <div className="flex gap-3 pt-4 border-t border-gray-800/40">
            <button onClick={handleSave} className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-lg">保存</button>
            <button onClick={handleCancelEdit} className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg">取消</button>
          </div>
        </div>
      ) : (
        <>
          {paper.abstract && (
            <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-3">摘要</h2>
              <p className="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap">{paper.abstract}</p>
            </div>
          )}

          {translation && (
            <div className="bg-gray-900/30 border border-purple-800/30 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-purple-400">中文翻译</h2>
                <span className="text-[10px] text-gray-600">AI 生成</span>
              </div>
              <div className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{translation}</div>
            </div>
          )}

          {paper.keywords && (
            <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-3">关键词</h2>
              <div className="flex flex-wrap gap-2">
                {paper.keywords.split(',').map((kw, i) => <span key={i} className="text-[10px] px-2 py-0.5 bg-amber-900/20 text-amber-400/70 rounded">{kw.trim()}</span>)}
              </div>
            </div>
          )}
          {(paper.ai_keywords || paper.ai_summary) && (() => {
            const aiKw = paper.ai_keywords ? JSON.parse(paper.ai_keywords) : [];
            const aiEnt = paper.ai_entities ? JSON.parse(paper.ai_entities) : {};
            const entCategories = [
              { key: 'companies', label: '公司', icon: '🏢' },
              { key: 'drugs', label: '药品', icon: '💊' },
              { key: 'people', label: '人物', icon: '👤' },
              { key: 'organizations', label: '机构', icon: '🏛️' },
              { key: 'diseases', label: '疾病', icon: '🩺' },
              { key: 'mechanisms', label: '靶点/机制', icon: '🧬' },
            ];
            return (
              <div className="bg-gray-900/30 border border-cyan-800/30 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-cyan-400 flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    AI 分析
                  </h2>
                  {paper.ai_analyzed_at && (
                    <span className="text-[10px] text-gray-600">{new Date(paper.ai_analyzed_at).toLocaleString('zh-CN')}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={handleSaveAiToNotes}
                    className="px-2 py-1 text-[10px] bg-cyan-900/30 hover:bg-cyan-900/50 text-cyan-400 rounded transition-colors"
                  >
                    保存到笔记
                  </button>
                </div>
                {paper.ai_summary && (
                  <p className="text-xs text-gray-400 border-l-2 border-cyan-500/30 pl-3 mb-4">{paper.ai_summary}</p>
                )}
                {aiKw.length > 0 && (
                  <div className="mb-4">
                    <span className="text-[10px] text-gray-500 mb-1.5 block">AI 关键词</span>
                    <div className="flex flex-wrap gap-1.5">
                      {aiKw.map((kw: string) => (
                        <span key={kw} className="text-[10px] px-2 py-0.5 bg-cyan-900/20 text-cyan-400/80 rounded">{kw}</span>
                      ))}
                    </div>
                  </div>
                )}
                {Object.values(aiEnt).some((v: any) => Array.isArray(v) && v.length > 0) && (
                  <div className="grid grid-cols-2 gap-3">
                    {entCategories.map(({ key, label, icon }) => {
                      const items = aiEnt[key] || [];
                      if (items.length === 0) return null;
                      return (
                        <div key={key}>
                          <span className="text-[10px] text-gray-500 mb-1 block">{icon} {label}</span>
                          <div className="flex flex-wrap gap-1">
                            {items.map((item: string) => (
                              <span key={item} className="text-[10px] px-1.5 py-0.5 bg-gray-800/60 text-gray-400 rounded">{item}</span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
          {paper.notes && (
            <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-3">个人笔记</h2>
              <p className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed">{paper.notes}</p>
            </div>
          )}

          {!paper.pdf_path && paper.content && (
            <TextContent text={paper.content} />
          )}
        </>
      )}
      </div>

      {/* PDF preview: full-width, outside max-w-4xl */}
      {paper.pdf_path && !editing && (
        <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl overflow-hidden">
          <div className="max-w-4xl mx-auto flex items-center justify-between px-5 py-3 border-b border-gray-800/40">
            <h2 className="text-sm font-semibold text-white">PDF 全文</h2>
            <div className="flex items-center gap-2">
              {!sidePanelOpen && (
                <button
                  onClick={() => setSidePanelOpen(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] bg-gray-800/60 hover:bg-gray-700/60 text-gray-300 rounded-lg transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                  打开侧栏
                </button>
              )}
              <button
                onClick={() => setReadingMode(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-400 rounded-lg transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                阅读模式
              </button>
            </div>
          </div>
          <div className="flex overflow-hidden">
            <div className={`p-5 flex flex-col items-center gap-4 bg-[#525659] transition-all duration-300 overflow-y-auto min-w-0 ${sidePanelOpen ? 'w-[calc(100%-420px)]' : 'flex-1'}`}>
              <InlinePdfPreview pdfPath={paper.pdf_path} onAction={handleInlineAction} />
            </div>
            {sidePanelOpen && (
              <div className="w-[420px] border-l border-gray-800/40 bg-[#1a1a1a] flex flex-col shrink-0">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/40 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {sidePanelMode === 'translate' ? '🌐' : sidePanelMode === 'explain' ? '💡' : '🔍'}
                    </span>
                    <h3 className="text-sm font-semibold text-white">
                      {sidePanelMode === 'translate' ? '中文翻译' : sidePanelMode === 'explain' ? 'AI 解释' : 'OCR 识别结果'}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {!sidePanelLoading && (
                      <button
                        onClick={handleSaveSidePanelToNotes}
                        disabled={sidePanelSaved}
                        className={`px-2 py-1 text-[10px] rounded transition-colors ${
                          sidePanelSaved
                            ? 'bg-emerald-900/30 text-emerald-400 cursor-default'
                            : 'bg-cyan-900/30 hover:bg-cyan-900/50 text-cyan-400'
                        }`}
                      >
                        {sidePanelSaved ? '已保存' : '保存到笔记'}
                      </button>
                    )}
                    <button onClick={() => setSidePanelOpen(false)} className="text-gray-500 hover:text-gray-300 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-700/30">
                    <span className="text-[10px] text-gray-500 mb-1.5 block">
                      {sidePanelMode === 'ocr' ? '识别来源' : '原文'}
                    </span>
                    <p className="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto">
                      {sidePanelSelectedText}
                    </p>
                  </div>
                  {sidePanelLoading ? (
                    <div className="space-y-3">
                      <div className="h-4 bg-gray-800/50 rounded animate-pulse w-3/4" />
                      <div className="h-4 bg-gray-800/50 rounded animate-pulse w-full" />
                      <div className="h-4 bg-gray-800/50 rounded animate-pulse w-5/6" />
                      <div className="h-4 bg-gray-800/50 rounded animate-pulse w-2/3" />
                    </div>
                  ) : (
                    <div className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{sidePanelContent}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TTS float controls for inline preview */}
      {speaking && (
        <div className="fixed bottom-6 right-6 z-[100] flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] border border-gray-800/40 rounded-lg shadow-lg">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
          <span className="text-[10px] text-emerald-400/60 mr-1">{paused ? '已暂停' : '朗读中...'}</span>
          {paused ? (
            <button onClick={handleResumeTTS} className="w-7 h-7 flex items-center justify-center bg-gray-800/60 hover:bg-gray-700 rounded-full text-gray-400 transition-colors" title="继续">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            </button>
          ) : (
            <button onClick={handlePauseTTS} className="w-7 h-7 flex items-center justify-center bg-gray-800/60 hover:bg-gray-700 rounded-full text-gray-400 transition-colors" title="暂停">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
            </button>
          )}
          <button onClick={handleStopTTS} className="w-7 h-7 flex items-center justify-center bg-gray-800/60 hover:bg-gray-700 rounded-full text-gray-400 transition-colors" title="停止">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
