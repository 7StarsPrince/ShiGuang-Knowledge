'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Tab = 'pdf' | 'url' | 'search' | 'manual';

interface SearchResult {
  title: string;
  authors: string;
  abstract: string;
  content: string;
  journal: string;
  year: string;
  doi: string;
  url: string;
  source: 'semanticscholar' | 'pubmed' | 'arxiv';
  externalId: string;
  _saved?: boolean;
  _savedId?: number;
}

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

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  semanticscholar: { label: 'Semantic Scholar', color: 'bg-green-900/30 text-green-400/80' },
  pubmed: { label: 'PubMed', color: 'bg-blue-900/30 text-blue-400/80' },
  arxiv: { label: 'arXiv', color: 'bg-orange-900/30 text-orange-400/80' },
};

export default function SavePaperPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('url');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  // Topic & tags (shared across tabs)
  const [topics, setTopics] = useState<Array<{ id: number; label: string }>>([]);
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  // URL tab
  const [url, setUrl] = useState('');

  // PDF tab
  const fileRef = useRef<HTMLInputElement>(null);
  const [pdfDrag, setPdfDrag] = useState(false);

  // Search tab
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  // PDF tab two-step flow
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPhase, setPdfPhase] = useState<'select' | 'parsing' | 'preview' | 'importing'>('select');
  const [pdfPreview, setPdfPreview] = useState<any>(null);
  const [pdfTitle, setPdfTitle] = useState('');
  const [pdfAuthors, setPdfAuthors] = useState('');
  const [pdfJournal, setPdfJournal] = useState('');
  const [pdfYear, setPdfYear] = useState('');
  const [pdfDoi, setPdfDoi] = useState('');
  const [pdfAbstract, setPdfAbstract] = useState('');
  const [pdfKeywords, setPdfKeywords] = useState('');
  const [pdfMethod, setPdfMethod] = useState<'vision' | 'text' | null>(null);

  useEffect(() => {
    fetch('/api/topics').then(r => r.json()).then((data: any[]) => {
      const flat: Array<{ id: number; label: string }> = [];
      const walk = (nodes: any[], depth = 0) => {
        for (const n of nodes) {
          const indent = '\u00A0\u00A0'.repeat(depth);
          flat.push({ id: n.id, label: depth > 0 ? `${indent}└ ${n.name}` : n.name });
          if (n.children) walk(n.children, depth + 1);
        }
      };
      walk(data);
      setTopics(flat);
    });
  }, []);

  const reset = () => {
    setResult(null);
    setError('');
    setUrl('');
    setSearchQuery('');
    setSearchResults([]);
    setTagsInput('');
    setSelectedTopicId('');
    setPdfFile(null);
    setPdfPhase('select');
    setPdfPreview(null);
    setPdfTitle('');
    setPdfAuthors('');
    setPdfJournal('');
    setPdfYear('');
    setPdfDoi('');
    setPdfAbstract('');
    setPdfKeywords('');
    setPdfMethod(null);
  };

  // PDF two-step import
  const handlePdfSelect = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('请上传 PDF 文件');
      return;
    }
    setError('');
    setPdfFile(file);
    setPdfPhase('select');
    setPdfPreview(null);
    setPdfTitle('');
    setPdfAuthors('');
    setPdfJournal('');
    setPdfYear('');
    setPdfDoi('');
    setPdfAbstract('');
    setPdfKeywords('');
    setPdfMethod(null);
  };

  const handlePdfParse = async () => {
    if (!pdfFile) return;
    setPdfPhase('parsing');
    setError('');
    const fd = new FormData();
    fd.append('file', pdfFile);
    try {
      const res = await fetch('/api/papers/import-pdf', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.preview) {
        setPdfPreview(data.preview);
        setPdfTitle(data.preview.title || '');
        setPdfAuthors(data.preview.authors || '');
        setPdfJournal(data.preview.journal || '');
        setPdfYear(data.preview.year || '');
        setPdfDoi(data.preview.doi || '');
        setPdfAbstract(data.preview.abstract || '');
        setPdfKeywords(data.preview.keywords || '');
        setPdfMethod(data.preview._extractionMethod || 'text');
        setPdfPhase('preview');
      } else {
        setError(data.error || 'PDF 解析失败');
        setPdfPhase('select');
      }
    } catch {
      setError('PDF 解析失败');
      setPdfPhase('select');
    }
  };

  const handlePdfImport = async () => {
    if (!pdfPreview?.pdfPath || saving) return;
    setSaving(true);
    setPdfPhase('importing');
    setError('');
    try {
      const res = await fetch('/api/papers/import-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import',
          title: pdfTitle,
          authors: pdfAuthors,
          journal: pdfJournal,
          year: pdfYear,
          doi: pdfDoi,
          abstract: pdfAbstract,
          keywords: pdfKeywords,
          pdfPath: pdfPreview.pdfPath,
          topic_id: selectedTopicId || undefined,
          tags: tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) setResult(data);
      else {
        setError(data.error || 'PDF 导入失败');
        setPdfPhase('preview');
      }
    } catch {
      setError('PDF 导入失败');
      setPdfPhase('preview');
    }
    setSaving(false);
  };

  // URL import
  const handleImport = async () => {
    if (!url.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/papers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          topic_id: selectedTopicId || undefined,
          tags: tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) setResult(data);
      else setError(data.error || '导入失败');
    } catch { setError('导入失败'); }
    setSaving(false);
  };

  // AI search
  const handleSearch = async () => {
    if (!searchQuery.trim() || searching) return;
    setSearching(true);
    setError('');
    try {
      const res = await fetch(`/api/papers/search?q=${encodeURIComponent(searchQuery.trim())}`);
      const data = await res.json();
      if (res.ok) setSearchResults(data.data || []);
      else setError(data.error || '搜索失败');
    } catch { setError('搜索失败'); }
    setSearching(false);
  };

  // Save search result
  const handleSaveResult = async (item: SearchResult, idx: number) => {
    try {
      const res = await fetch('/api/papers/save-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...item,
          topic_id: selectedTopicId || undefined,
          tags: tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok || res.status === 409) {
        setSearchResults(prev => prev.map((r, i) => i === idx ? { ...r, _saved: true, _savedId: data.id } : r));
      }
    } catch { /* ignore */ }
  };

  // Manual submit
  const handleManualSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    const body = {
      title: fd.get('title'),
      authors: fd.get('authors'),
      abstract: fd.get('abstract'),
      journal: fd.get('journal'),
      year: fd.get('year'),
      doi: fd.get('doi'),
      url: fd.get('url'),
      keywords: fd.get('keywords'),
      topic_id: selectedTopicId || undefined,
      tags: tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : undefined,
    };
    try {
      const res = await fetch('/api/papers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) setResult({ id: data.id, title: body.title, authors: body.authors });
      else setError(data.error || '保存失败');
    } catch { setError('保存失败'); }
    setSaving(false);
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'pdf', label: 'PDF 导入' },
    { key: 'url', label: '链接收藏' },
    { key: 'search', label: 'AI 搜索' },
    { key: 'manual', label: '手动填写' },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <button onClick={() => router.push('/papers')} className="text-xs text-gray-500 hover:text-gray-300 mb-2 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          返回列表
        </button>
        <h1 className="text-xl font-bold text-white">添加论文</h1>
      </div>

      {result ? (
        <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-6 space-y-3">
          <div className="text-sm font-semibold text-amber-400">添加成功!</div>
          <div className="text-xs text-gray-400">
            <span className="text-gray-300">{result.title}</span>
            {result.authors && <span className="ml-2">· {result.authors}</span>}
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => router.push(`/papers/${result.id}`)} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs rounded-lg">查看详情</button>
            <button onClick={reset} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg">继续添加</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-1 bg-gray-900/50 rounded-lg p-1">
            {tabs.map(t => (
              <button key={t.key} onClick={() => { setTab(t.key); setError(''); }}
                className={`flex-1 py-2 text-xs rounded-md transition-colors ${tab === t.key ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Shared: Topic & Tags */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[10px] text-gray-500 mb-1">话题分类</label>
              <select value={selectedTopicId} onChange={e => setSelectedTopicId(e.target.value)}
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-amber-500/50 appearance-none">
                <option value="">不选择话题</option>
                {topics.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-gray-500 mb-1">标签（逗号分隔）</label>
              <input value={tagsInput} onChange={e => setTagsInput(e.target.value)}
                placeholder="如: 肿瘤免疫, CAR-T"
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500/50" />
            </div>
          </div>

          {/* PDF Import */}
          {tab === 'pdf' && (
            <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-6 space-y-4">
              <div
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${pdfDrag ? 'border-amber-500/60 bg-amber-900/10' : 'border-gray-700/50'} ${pdfPhase === 'select' ? 'cursor-pointer hover:border-gray-600/50' : ''}`}
                onClick={() => pdfPhase === 'select' && fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setPdfDrag(true); }}
                onDragLeave={() => setPdfDrag(false)}
                onDrop={e => {
                  e.preventDefault();
                  setPdfDrag(false);
                  const file = e.dataTransfer.files[0];
                  if (file) handlePdfSelect(file);
                }}
              >
                <input ref={fileRef} type="file" accept=".pdf" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfSelect(f); }} />
                {pdfPhase === 'parsing' ? (
                  <div className="space-y-2">
                    <svg className="w-8 h-8 text-amber-400 mx-auto animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    <p className="text-xs text-gray-400">正在解析 PDF...</p>
                  </div>
                ) : pdfFile ? (
                  <div className="space-y-2">
                    <svg className="w-8 h-8 text-amber-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                    <p className="text-xs text-gray-300">{pdfFile.name}</p>
                    {pdfPhase === 'select' && <p className="text-[10px] text-gray-500">点击“解析 PDF”开始识别</p>}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <svg className="w-8 h-8 text-gray-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                    <p className="text-xs text-gray-400">点击或拖拽 PDF 文件到此处</p>
                    <p className="text-[10px] text-gray-600">选择文件后点击“解析 PDF”识别元数据</p>
                  </div>
                )}
              </div>

              {pdfPhase === 'select' && pdfFile && (
                <button onClick={handlePdfParse}
                  className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-lg transition-colors">
                  解析 PDF
                </button>
              )}

              {(pdfPhase === 'preview' || pdfPhase === 'importing') && (
                <div className="space-y-4">
                  {pdfMethod === 'vision' ? (
                    <div className="text-[10px] text-emerald-400/80 bg-emerald-900/20 border border-emerald-500/20 rounded-lg px-3 py-1.5">
                      已使用 OCR（视觉模型）识别，请核对以下字段
                    </div>
                  ) : (
                    <div className="text-[10px] text-amber-400/80 bg-amber-900/20 border border-amber-500/20 rounded-lg px-3 py-1.5">
                      已从 PDF 文本识别，请核对以下字段
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">标题</label>
                    <input value={pdfTitle} onChange={e => setPdfTitle(e.target.value)}
                      className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">作者</label>
                      <input value={pdfAuthors} onChange={e => setPdfAuthors(e.target.value)}
                        className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">期刊/会议</label>
                      <input value={pdfJournal} onChange={e => setPdfJournal(e.target.value)}
                        className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">年份</label>
                      <input value={pdfYear} onChange={e => setPdfYear(e.target.value)}
                        className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">DOI</label>
                      <input value={pdfDoi} onChange={e => setPdfDoi(e.target.value)}
                        className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">关键词</label>
                      <input value={pdfKeywords} onChange={e => setPdfKeywords(e.target.value)}
                        className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">摘要</label>
                    <textarea value={pdfAbstract} onChange={e => setPdfAbstract(e.target.value)} rows={4}
                      className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-300 resize-y focus:outline-none focus:border-amber-500/50" />
                  </div>

                  <button onClick={handlePdfImport} disabled={pdfPhase === 'importing' || !pdfTitle.trim()}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
                    {pdfPhase === 'importing' ? '添加中...' : '确定添加'}
                  </button>
                </div>
              )}

              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
          )}

          {/* URL Import */}
          {tab === 'url' && (
            <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-6">
              <div className="flex gap-2">
                <input value={url} onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleImport(); }}
                  placeholder="粘贴论文链接（PubMed、arXiv、知网等）"
                  className="flex-1 bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
                  autoFocus />
                <button onClick={handleImport} disabled={saving || !url.trim()}
                  className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors shrink-0">
                  {saving ? '收藏中...' : '收藏'}
                </button>
              </div>
              {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
              <p className="text-[10px] text-gray-600 mt-3">支持 PubMed、arXiv、Springer、知网等学术网站</p>
            </div>
          )}

          {/* AI Search */}
          {tab === 'search' && (
            <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-6 space-y-4">
              <div className="flex gap-2">
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                  placeholder="输入论文标题或关键词（支持模糊搜索）"
                  className="flex-1 bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
                  autoFocus />
                <button onClick={handleSearch} disabled={searching || !searchQuery.trim()}
                  className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors shrink-0">
                  {searching ? '搜索中...' : '搜索'}
                </button>
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}

              {searchResults.length > 0 && (
                <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
                  {searchResults.map((r, i) => (
                    <div key={i} className="bg-gray-800/30 border border-gray-700/30 rounded-lg p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-semibold text-gray-200 leading-snug">{r.title}</h4>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {r.authors && <span className="text-[10px] text-gray-500 truncate max-w-[200px]">{r.authors.split(',').slice(0, 3).join(', ')}{r.authors.split(',').length > 3 ? ' et al.' : ''}</span>}
                            {r.journal && <span className="text-[10px] text-amber-400/60 italic">{r.journal}</span>}
                            {r.year && <span className="text-[10px] text-gray-500">{r.year}</span>}
                            {r.doi && <span className="text-[10px] text-gray-600 truncate max-w-[120px]">{r.doi}</span>}
                            <span className={`text-[9px] px-1.5 py-0.5 rounded ${SOURCE_LABELS[r.source]?.color || 'bg-gray-700 text-gray-400'}`}>
                              {SOURCE_LABELS[r.source]?.label || r.source}
                            </span>
                          </div>
                          {r.abstract && (
                            <p className="text-[10px] text-gray-500 mt-1.5 line-clamp-2">{r.abstract.substring(0, 200)}...</p>
                          )}
                        </div>
                        {r._saved ? (
                          <button onClick={() => router.push(`/papers/${r._savedId}`)}
                            className="shrink-0 px-3 py-1.5 text-[11px] bg-emerald-900/30 text-emerald-400 rounded-md">
                            已收藏
                          </button>
                        ) : (
                          <button onClick={() => handleSaveResult(r, i)}
                            className="shrink-0 px-3 py-1.5 text-[11px] bg-amber-600 hover:bg-amber-700 text-white rounded-md transition-colors">
                            收藏
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {searching && (
                <div className="flex items-center justify-center gap-2 py-6">
                  <svg className="w-4 h-4 text-amber-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  <span className="text-xs text-gray-400">正在搜索 Semantic Scholar、PubMed、arXiv...</span>
                </div>
              )}

              {!searching && searchResults.length === 0 && searchQuery && (
                <p className="text-xs text-gray-600 text-center py-4">输入标题后按回车或点击搜索</p>
              )}
            </div>
          )}

          {/* Manual */}
          {tab === 'manual' && (
            <form onSubmit={handleManualSubmit} className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-6 space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">标题 *</label>
                <input name="title" required className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">作者（逗号分隔）</label>
                  <input name="authors" className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">期刊/会议</label>
                  <input name="journal" className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">年份</label>
                  <input name="year" placeholder="2024" className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">DOI</label>
                  <input name="doi" className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">论文链接</label>
                  <input name="url" className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">摘要</label>
                <textarea name="abstract" rows={4} className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-300 resize-y focus:outline-none focus:border-amber-500/50" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">关键词（逗号分隔）</label>
                <input name="keywords" className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50" />
              </div>
              <button type="submit" disabled={saving}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
                {saving ? '保存中...' : '保存'}
              </button>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </form>
          )}
        </>
      )}
    </div>
  );
}
