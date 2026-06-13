'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

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

type Step = 'input' | 'editing' | 'done';

export default function SaveArticlePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('input');
  const [url, setUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Extracted data from import
  const [preview, setPreview] = useState<any>(null);

  // Editable fields
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [summary, setSummary] = useState('');
  const [topicId, setTopicId] = useState<number | ''>('');
  const [tagsInput, setTagsInput] = useState('');

  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [savedTitle, setSavedTitle] = useState('');

  useEffect(() => {
    fetch('/api/topics').then(r => r.json()).then((data: any[]) => setTopics(data.map(t => toTopicOption(t))));
  }, []);

  const handleImport = async () => {
    if (!url.trim() || importing) return;
    setImporting(true);
    setError('');

    try {
      const res = await fetch('/api/articles/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setPreview(data);
        setTitle(data.title || '');
        setAuthor(data.author || '');
        setSourceName(data.sourceName || '');
        setSummary(data.summary || '');
        setStep('editing');
      } else {
        setError(data.error || '导入失败');
      }
    } catch {
      setError('导入失败，请检查网络');
    }
    setImporting(false);
  };

  const handleSave = async () => {
    if (!preview || saving) return;
    setSaving(true);
    setError('');

    const tags = tagsInput.split(/[,，]/).map(t => t.trim()).filter(Boolean);

    try {
      const res = await fetch('/api/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          author: author || null,
          source_name: sourceName || null,
          source_url: url.trim(),
          summary: summary || null,
          content: preview.contentText || null,
          content_html: preview.contentHtml || null,
          cover_image: preview.coverImage || null,
          published_at: preview.publishedAt || null,
          topic_id: topicId || null,
          tags,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSavedId(data.id);
        setSavedTitle(title);
        setStep('done');
      } else {
        setError(data.error || '保存失败');
      }
    } catch {
      setError('保存失败');
    }
    setSaving(false);
  };

  const handleReset = () => {
    setStep('input');
    setUrl('');
    setPreview(null);
    setTitle('');
    setAuthor('');
    setSourceName('');
    setSummary('');
    setTopicId('');
    setTagsInput('');
    setError('');
    setSavedId(null);
    setSavedTitle('');
  };

  const flatTopics = flattenTopics(topics);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <button onClick={() => router.push('/articles')} className="text-xs text-gray-500 hover:text-gray-300 mb-2 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          返回列表
        </button>
        <h1 className="text-xl font-bold text-white">收藏文章</h1>
      </div>

      {step === 'done' ? (
        <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-6 space-y-3">
          <div className="text-sm font-semibold text-emerald-400">收藏成功!</div>
          <div className="text-xs text-gray-400">
            <span className="text-gray-300">{savedTitle}</span>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => router.push(`/articles/${savedId}`)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-lg">
              查看详情
            </button>
            <button onClick={handleReset}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg">
              继续收藏
            </button>
          </div>
        </div>
      ) : step === 'editing' ? (
        <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-6 space-y-4">
          <div className="text-sm text-emerald-400 font-semibold mb-2">文章已解析，请确认信息后保存</div>

          {/* Preview info */}
          <div className="text-xs text-gray-500 flex items-center gap-2">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
            <span className="truncate max-w-md">{url}</span>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">标题</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/50" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">作者/公众号</label>
              <input value={author} onChange={e => setAuthor(e.target.value)}
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/50" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">来源</label>
              <input value={sourceName} onChange={e => setSourceName(e.target.value)}
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/50" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">摘要</label>
            <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={2}
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-300 resize-y focus:outline-none focus:border-emerald-500/50" />
          </div>

          {/* Content preview */}
          {preview.contentHtml ? (
            <div>
              <label className="block text-xs text-gray-400 mb-1">正文预览</label>
              <div className="bg-gray-800/30 border border-gray-700/30 rounded-lg p-4 max-h-60 overflow-y-auto">
                <div className="text-xs text-gray-400 prose prose-invert prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: preview.contentHtml }} />
              </div>
            </div>
          ) : preview.contentText ? (
            <div>
              <label className="block text-xs text-gray-400 mb-1">正文预览</label>
              <div className="bg-gray-800/30 border border-gray-700/30 rounded-lg p-4 max-h-60 overflow-y-auto">
                <p className="text-xs text-gray-400 line-clamp-8">{preview.contentText.slice(0, 500)}...</p>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">所属话题</label>
              <select value={topicId} onChange={e => setTopicId(e.target.value ? Number(e.target.value) : '')}
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/50">
                <option value="">不选择</option>
                {flatTopics.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">标签（逗号分隔）</label>
              <input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="如: 免疫治疗, PD-1"
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/50" />
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-800/40">
            <button onClick={handleSave} disabled={saving}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
              {saving ? '保存中...' : '保存'}
            </button>
            <button onClick={handleReset}
              className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">
              取消
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      ) : (
        <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-6">
          <div className="flex gap-2">
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleImport(); }}
              placeholder="粘贴公众号文章链接，如 https://mp.weixin.qq.com/s/..."
              className="flex-1 bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
              autoFocus
            />
            <button onClick={handleImport} disabled={importing || !url.trim()}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors shrink-0">
              {importing ? '导入中...' : '导入'}
            </button>
          </div>
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
          <p className="text-[10px] text-gray-600 mt-3">支持微信公众号文章、普通网页链接</p>
        </div>
      )}
    </div>
  );
}
