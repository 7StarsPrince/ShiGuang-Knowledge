'use client';

import { useEffect, useState, useCallback } from 'react';

type ContentType = 'article' | 'speech' | 'paper';

interface Stats {
  article: { total: number; analyzed: number };
  speech: { total: number; analyzed: number };
  paper: { total: number; analyzed: number };
}

interface ProgressEvent {
  current: number;
  total: number;
  type: ContentType;
  id: number;
  title: string;
}

const TYPE_LABELS: Record<ContentType, { label: string; barColor: string; btnColor: string; btnHover: string; textColor: string }> = {
  article: { label: '公众号文章', barColor: 'bg-emerald-500/60', btnColor: 'bg-emerald-900/30', btnHover: 'hover:bg-emerald-900/50', textColor: 'text-emerald-400' },
  speech: { label: '科技研讨会', barColor: 'bg-blue-500/60', btnColor: 'bg-blue-900/30', btnHover: 'hover:bg-blue-900/50', textColor: 'text-blue-400' },
  paper: { label: '学术论文', barColor: 'bg-amber-500/60', btnColor: 'bg-amber-900/30', btnHover: 'hover:bg-amber-900/50', textColor: 'text-amber-400' },
};

interface LLMSettings {
  config: {
    provider: string;
    apiKey: string;
    baseUrl: string;
    model: string;
    hasKey: boolean;
  };
  providers: Record<string, { label: string; baseUrl: string; models: string[] }>;
}

export default function AIAnalysisPage() {
  const [tab, setTab] = useState<'analyze' | 'generate'>('analyze');
  const [stats, setStats] = useState<Stats | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [processed, setProcessed] = useState(0);
  const [failed, setFailed] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [logs, setLogs] = useState<Array<{ msg: string; type: 'info' | 'error' }>>([]);
  // Track per-type increments during batch for live stats update
  const [typeDelta, setTypeDelta] = useState<Record<ContentType, number>>({ article: 0, speech: 0, paper: 0 });

  // LLM Settings
  const [settings, setSettings] = useState<LLMSettings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ provider: 'glm', apiKey: '', baseUrl: '', model: '' });
  const [savingSettings, setSavingSettings] = useState(false);

  // Generation states
  const [refType, setRefType] = useState<ContentType | ''>('');
  const [contentList, setContentList] = useState<Array<{ id: number; title: string }>>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | ''>('');
  const [selectedRefs, setSelectedRefs] = useState<Array<{ type: string; id: number; title: string }>>([]);
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [generating, setGenerating] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const fetchStats = useCallback(() => {
    fetch('/api/ai/status').then(r => r.json()).then(setStats).catch(console.error);
  }, []);

  const fetchSettings = useCallback(() => {
    fetch('/api/ai/settings').then(r => r.json()).then((data: LLMSettings) => {
      setSettings(data);
      setSettingsForm({
        provider: data.config.provider || 'glm',
        apiKey: data.config.apiKey || '',
        baseUrl: data.config.baseUrl || '',
        model: data.config.model || '',
      });
      // Auto-show settings if no API key configured
      if (!data.config.hasKey) setShowSettings(true);
    }).catch(console.error);
  }, []);

  useEffect(() => { fetchStats(); fetchSettings(); }, [fetchStats, fetchSettings]);

  // Fetch content list when type changes
  useEffect(() => {
    setSelectedItemId('');
    if (!refType) { setContentList([]); return; }
    fetch(`/api/ai/content-list?type=${refType}`)
      .then(r => r.json())
      .then(d => setContentList(d.data || []))
      .catch(() => setContentList([]));
  }, [refType]);

  const addRef = () => {
    if (!refType || !selectedItemId) return;
    const item = contentList.find(c => c.id === Number(selectedItemId));
    if (!item) return;
    const exists = selectedRefs.some(r => r.type === refType && r.id === item.id);
    if (!exists) {
      setSelectedRefs(prev => [...prev, { type: refType, id: item.id, title: item.title }]);
    }
    setSelectedItemId('');
  };

  const removeRef = (type: string, id: number) => {
    setSelectedRefs(prev => prev.filter(r => !(r.type === type && r.id === id)));
  };

  // Generate content via chat
  const handleGenerate = async () => {
    if (!chatInput.trim() || generating) return;
    const userMsg = { role: 'user', content: chatInput };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput('');
    setGenerating(true);
    setGeneratedContent('');

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          references: selectedRefs.map(r => ({ type: r.type, id: r.id })),
          messages: newMessages,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setChatMessages(prev => [...prev, { role: 'assistant', content: `错误: ${err.error}` }]);
        setGenerating(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // Parse SSE data lines
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullText += delta;
              setGeneratedContent(fullText);
            }
          } catch {}
        }
      }

      setChatMessages(prev => [...prev, { role: 'assistant', content: fullText }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: '生成失败，请重试' }]);
    } finally {
      setGenerating(false);
    }
  };

  const runBatch = async (contentType?: ContentType | 'all') => {
    if (processing) return;
    setProcessing(true);
    setProcessed(0);
    setFailed(0);
    setProgress(null);
    setLogs([]);
    setTypeDelta({ article: 0, speech: 0, paper: 0 });

    try {
      const res = await fetch('/api/ai/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: contentType || 'all' }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || '启动失败');
        setProcessing(false);
        return;
      }

      // Check if it's a JSON response (no items to process)
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.json();
        alert(data.message || '没有需要分析的内容');
        setProcessing(false);
        fetchStats();
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          try {
            const event = JSON.parse(data);
            if (event.current !== undefined) {
              setProgress(event);
              setTotalItems(event.total);
              setProcessed(event.current);
              // Increment per-type delta for live card updates
              if (event.type === 'article' || event.type === 'speech' || event.type === 'paper') {
                const t: ContentType = event.type;
                setTypeDelta(prev => ({ ...prev, [t]: (prev[t] || 0) + 1 }));
              }
              setLogs(prev => [...prev.slice(-50), { msg: `[${event.type}#${event.id}] ${event.title || ''}`, type: 'info' }]);
            } else if (event.processed !== undefined) {
              setProcessed(event.processed);
              setFailed(event.failed);
            } else if (event.error) {
              setLogs(prev => [...prev.slice(-50), { msg: `错误: ${event.error}`, type: 'error' }]);
              setFailed(prev => prev + 1);
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error('Batch error:', err);
      alert('批量分析失败');
    } finally {
      setProcessing(false);
      setProgress(null);
      setTypeDelta({ article: 0, speech: 0, paper: 0 });
      fetchStats();
    }
  };

  if (!stats) return <div className="text-center py-16 text-gray-500">Loading...</div>;

  const currentProviderInfo = settings?.providers?.[settingsForm.provider];

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch('/api/ai/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm),
      });
      const data = await res.json();
      if (data.ok) {
        setShowSettings(false);
        fetchSettings();
      } else {
        alert(data.error || '保存失败');
      }
    } catch {
      alert('保存失败');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header with tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            AI 分析与生成
          </h1>
          <div className="flex bg-gray-800/60 rounded-lg p-0.5">
            <button onClick={() => setTab('analyze')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${tab === 'analyze' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
              分析
            </button>
            <button onClick={() => setTab('generate')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${tab === 'generate' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
              生成
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'analyze' && (
            <>
              <button onClick={() => setShowSettings(!showSettings)}
                className={`px-3 py-2 text-xs rounded-lg transition-colors flex items-center gap-1.5 ${showSettings ? 'bg-gray-700 text-gray-200' : 'bg-gray-800/60 hover:bg-gray-700 text-gray-400'}`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                LLM 配置
              </button>
              <button onClick={() => runBatch('all')} disabled={processing || !settings?.config?.hasKey}
                className={`px-4 py-2 text-sm rounded-lg transition-colors flex items-center gap-2 ${processing ? 'bg-cyan-900/30 text-cyan-400/50 cursor-wait' : !settings?.config?.hasKey ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-700 text-white'}`}>
                {processing ? '分析中...' : '分析全部未处理'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ========== ANALYZE TAB ========== */}
      {tab === 'analyze' && (
        <>
          {/* LLM Settings Panel */}
          {showSettings && (
            <div className="bg-gray-900/30 border border-cyan-800/30 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-cyan-400">LLM 配置</h2>
                {settings?.config?.hasKey && (
                  <span className="text-[10px] text-emerald-400/70 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                    已配置 ({settings.config.provider})
                  </span>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">LLM 提供商</label>
                  <div className="grid grid-cols-4 gap-2">
                    {settings?.providers && Object.entries(settings.providers).map(([key, info]) => (
                      <button key={key} onClick={() => {
                        const newForm = { ...settingsForm, provider: key, model: info.models[0] || '' };
                        if (key !== 'custom') newForm.baseUrl = info.baseUrl;
                        setSettingsForm(newForm);
                      }}
                        className={`px-3 py-2 text-xs rounded-lg border transition-colors text-left ${settingsForm.provider === key ? 'border-cyan-500/50 bg-cyan-900/20 text-cyan-400' : 'border-gray-700/50 bg-gray-800/40 text-gray-400 hover:border-gray-600'}`}>
                        <div className="font-medium">{info.label}</div>
                        {key !== 'custom' && <div className="text-[10px] text-gray-500 mt-0.5 truncate">{info.baseUrl.replace('https://', '')}</div>}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">API Key</label>
                  <input type="password" value={settingsForm.apiKey}
                    onChange={e => setSettingsForm({ ...settingsForm, apiKey: e.target.value })}
                    placeholder={settings?.config?.hasKey ? '已保存，留空保持不变' : '输入你的 API Key'}
                    className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-cyan-500/50 font-mono" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">模型</label>
                    {currentProviderInfo?.models && currentProviderInfo.models.length > 0 ? (
                      <select value={settingsForm.model} onChange={e => setSettingsForm({ ...settingsForm, model: e.target.value })}
                        className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-cyan-500/50">
                        {currentProviderInfo.models.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    ) : (
                      <input value={settingsForm.model} onChange={e => setSettingsForm({ ...settingsForm, model: e.target.value })}
                        placeholder="模型名称" className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-cyan-500/50" />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">Base URL {settingsForm.provider !== 'custom' && <span className="text-gray-600">(自动填充)</span>}</label>
                    <input value={settingsForm.baseUrl} onChange={e => setSettingsForm({ ...settingsForm, baseUrl: e.target.value })}
                      placeholder="https://..." className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-cyan-500/50" />
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <button onClick={handleSaveSettings} disabled={savingSettings}
                    className="px-4 py-2 text-xs bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors disabled:opacity-50">
                    {savingSettings ? '保存中...' : '保存配置'}
                  </button>
                  {settings?.config?.hasKey && (
                    <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg transition-colors">收起</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Stats cards */}
          <div className="grid grid-cols-3 gap-4">
            {(Object.entries(TYPE_LABELS) as [ContentType, typeof TYPE_LABELS[ContentType]][]).map(([type, { label, barColor, btnColor, btnHover, textColor }]) => {
              const s = stats[type];
              const liveAnalyzed = s.analyzed + (typeDelta[type] || 0);
              const pct = s.total > 0 ? Math.round((liveAnalyzed / s.total) * 100) : 0;
              const isActive = progress?.type === type && processing;
              return (
                <div key={type} className={`bg-gray-900/30 rounded-xl p-5 transition-colors ${isActive ? 'border border-cyan-800/40' : 'border border-gray-800/40'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                      {label}
                      {isActive && <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />}
                    </span>
                    <button onClick={() => runBatch(type)} disabled={processing}
                      className={`text-[10px] px-2 py-1 rounded transition-colors ${processing ? 'bg-gray-800 text-gray-500 cursor-wait' : `${btnColor} ${btnHover} ${textColor}`}`}>
                      {processing ? '处理中' : '分析'}
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                    <span>{liveAnalyzed} / {s.total}</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-500 rounded-full ${isActive ? 'bg-cyan-500/60' : barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {processing && progress && (
            <div className="bg-gray-900/30 border border-cyan-800/30 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-cyan-400 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" /> 正在分析...
                </span>
                <span className="text-xs text-gray-500">{processed} / {totalItems}</span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-3">
                <div className="h-full bg-cyan-500/60 transition-all duration-300" style={{ width: `${totalItems > 0 ? (processed / totalItems) * 100 : 0}%` }} />
              </div>
              <div className="text-xs text-gray-500">
                当前: <span className="text-gray-300">{TYPE_LABELS[progress.type]?.label} #{progress.id}</span>
                {progress.title && <span className="ml-2 text-gray-400">{progress.title.slice(0, 50)}</span>}
              </div>
            </div>
          )}

          {!processing && (processed > 0 || failed > 0) && (
            <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-5">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-cyan-400">完成: {processed}</span>
                {failed > 0 && <span className="text-red-400">失败: {failed}</span>}
              </div>
            </div>
          )}

          {logs.length > 0 && (
            <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-5">
              <h3 className="text-xs text-gray-500 mb-2">处理日志</h3>
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {logs.map((log, i) => (
                  <div key={i} className={`text-[10px] font-mono ${log.type === 'error' ? 'text-red-400' : 'text-gray-500'}`}>{log.msg}</div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ========== GENERATE TAB ========== */}
      {tab === 'generate' && (
        <div className="grid grid-cols-2 gap-4">
          {/* Left: References + Chat */}
          <div className="space-y-4">
            {/* Reference selector - two-level dropdown */}
            <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-1.5">
                <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                参考内容
              </h2>
              {/* Two dropdowns */}
              <div className="flex gap-2 mb-3 items-start">
                {/* Type selector */}
                <select value={refType} onChange={e => { setRefType(e.target.value as ContentType | ''); setDropdownOpen(false); }}
                  className="w-32 shrink-0 bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-cyan-500/50">
                  <option value="">选择类型</option>
                  <option value="article">公众号文章</option>
                  <option value="speech">科技研讨会</option>
                  <option value="paper">学术论文</option>
                </select>
                {/* Content selector - custom dropdown with max height */}
                <div className="flex-1 min-w-0 relative" onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}>
                  <button type="button" onClick={() => { if (refType && contentList.length > 0) setDropdownOpen(!dropdownOpen); }}
                    disabled={!refType || contentList.length === 0}
                    className="w-full text-left bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-cyan-500/50 flex items-center justify-between disabled:opacity-40">
                    <span className="truncate min-w-0">
                      {selectedItemId ? contentList.find(c => c.id === Number(selectedItemId))?.title || '选择内容' : (refType ? (contentList.length === 0 ? '暂无内容' : '选择内容') : '请先选择类型')}
                    </span>
                    <svg className="w-3 h-3 shrink-0 ml-1 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {dropdownOpen && (
                    <div className="absolute z-50 left-0 right-0 mt-1 bg-gray-800 border border-gray-700/60 rounded-lg shadow-xl overflow-hidden">
                      <div className="max-h-48 overflow-y-auto">
                        {contentList.map(item => (
                          <button key={item.id} type="button"
                            onMouseDown={() => { setSelectedItemId(item.id); setDropdownOpen(false); }}
                            className={`w-full text-left px-3 py-2 text-xs transition-colors block truncate ${Number(selectedItemId) === item.id ? 'bg-cyan-900/30 text-cyan-400' : 'text-gray-300 hover:bg-gray-700/60'}`}>
                            {item.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <button onClick={addRef} disabled={!refType || !selectedItemId}
                  className="px-3 py-2 text-xs bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
                  添加
                </button>
              </div>
              {/* Selected refs */}
              {selectedRefs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {selectedRefs.map((ref) => (
                    <span key={`${ref.type}-${ref.id}`} className="text-[10px] px-2 py-1 bg-cyan-900/30 text-cyan-400 rounded inline-flex items-center gap-1 max-w-full">
                      <span className="shrink-0">{ref.type === 'article' ? '文章' : ref.type === 'speech' ? '演讲' : '论文'}</span>
                      <span className="text-gray-300 truncate min-w-0">{ref.title}</span>
                      <button onClick={() => removeRef(ref.type, ref.id)} className="text-cyan-600 hover:text-cyan-400 shrink-0">&times;</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Chat area */}
            <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-4 flex flex-col" style={{ minHeight: 300 }}>
              <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-1.5">
                <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                对话指令
              </h2>
              {/* Chat history */}
              <div className="flex-1 overflow-y-auto space-y-2 mb-3 max-h-60">
                {chatMessages.length === 0 && (
                  <p className="text-[10px] text-gray-600">输入提示词，AI 将基于选中的参考内容生成文章</p>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`text-xs px-3 py-2 rounded-lg ${msg.role === 'user' ? 'bg-cyan-900/20 text-cyan-300 ml-8' : 'bg-gray-800/60 text-gray-300 mr-4'}`}>
                    <span className="text-[10px] text-gray-500 block mb-0.5">{msg.role === 'user' ? '你' : 'AI'}</span>
                    <div className="whitespace-pre-wrap">{msg.content.slice(0, 500)}{msg.content.length > 500 ? '...' : ''}</div>
                  </div>
                ))}
              </div>
              {/* Input */}
              <div className="flex gap-2">
                <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
                  placeholder="输入指令，如：请基于参考内容写一篇关于PD-1药物的综述..."
                  rows={2}
                  className="flex-1 bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-200 resize-none focus:outline-none focus:border-cyan-500/50" />
                <button onClick={handleGenerate} disabled={generating || !chatInput.trim() || !settings?.config?.hasKey}
                  className={`px-4 rounded-lg text-xs font-medium transition-colors self-end ${generating ? 'bg-cyan-900/30 text-cyan-400/50' : !settings?.config?.hasKey ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-700 text-white'}`}>
                  {generating ? '生成中...' : '发送'}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Generated output */}
          <div className="bg-gray-900/30 border border-cyan-800/20 rounded-xl p-4 flex flex-col" style={{ minHeight: 500 }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-1.5">
                <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                生成内容
              </h2>
              {generatedContent && (
                <button onClick={() => navigator.clipboard.writeText(generatedContent)}
                  className="text-[10px] px-2 py-1 bg-gray-800/60 hover:bg-gray-700 text-gray-400 rounded transition-colors">
                  复制
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {generating && !generatedContent && (
                <div className="flex items-center gap-2 text-xs text-cyan-400/60">
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" /> AI 正在生成...
                </div>
              )}
              {generatedContent ? (
                <div className="text-sm text-gray-300 leading-7 whitespace-pre-wrap">{generatedContent}</div>
              ) : !generating ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <svg className="w-10 h-10 text-gray-800 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <p className="text-xs text-gray-600">选择参考内容并输入指令</p>
                    <p className="text-[10px] text-gray-700 mt-1">生成的内容将显示在这里</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
