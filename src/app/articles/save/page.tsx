'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface TopicOption {
  id: number;
  name: string;
  children: TopicOption[];
}

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

export default function SaveArticlePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [topicId, setTopicId] = useState<number | ''>('');
  const [topics, setTopics] = useState<TopicOption[]>([]);

  useEffect(() => {
    fetch('/api/topics').then(r => r.json()).then((data: any[]) => {
      setTopics(data.map((t: any) => toTopicOption(t)));
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);

    const fd = new FormData(e.currentTarget);
    const body = {
      title: fd.get('title'),
      source_name: fd.get('source_name'),
      source_url: fd.get('source_url'),
      author: fd.get('author'),
      summary: fd.get('summary'),
      content: fd.get('content'),
      published_at: fd.get('published_at') || null,
      topic_id: topicId || null,
      tags: (fd.get('tags') as string).split(',').map((t: string) => t.trim()).filter(Boolean),
    };

    try {
      const res = await fetch('/api/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
      } else {
        alert(data.error || 'Save failed');
      }
    } catch {
      alert('Save failed');
    }
    setSaving(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <button onClick={() => router.push('/articles')} className="text-xs text-gray-500 hover:text-gray-300 mb-2 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          返回列表
        </button>
        <h1 className="text-xl font-bold text-white">收藏文章</h1>
        <p className="text-xs text-gray-500 mt-1">保存公众号优质内容到你的知识库</p>
      </div>

      {result ? (
        <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-6 space-y-3">
          <div className="text-sm font-semibold text-emerald-400">收藏成功!</div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => router.push(`/articles/${result.id}`)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-lg">
              查看详情
            </button>
            <button onClick={() => setResult(null)}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg">
              继续收藏
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">标题 *</label>
            <input name="title" required className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/50" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">来源公众号</label>
              <input name="source_name" className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/50" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">作者</label>
              <input name="author" className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/50" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">原文链接</label>
            <input name="source_url" type="url" className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/50" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">发布日期</label>
            <input name="published_at" type="date" className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/50" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">话题</label>
            <select value={topicId} onChange={(e) => setTopicId(e.target.value ? Number(e.target.value) : '')}
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/50">
              <option value="">不选择</option>
              {flattenTopics(topics).map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">摘要</label>
            <textarea name="summary" rows={2} className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-300 resize-y focus:outline-none focus:border-emerald-500/50" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">正文内容</label>
            <textarea name="content" rows={12} className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-300 resize-y focus:outline-none focus:border-emerald-500/50" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">标签（逗号分隔）</label>
            <input name="tags" placeholder="如: 创新药,Biotech,投资" className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/50" />
          </div>
          <button type="submit" disabled={saving}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
            {saving ? '保存中...' : '收藏'}
          </button>
        </form>
      )}
    </div>
  );
}
