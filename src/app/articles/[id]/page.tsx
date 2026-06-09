'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Article {
  id: number;
  title: string;
  source_name: string;
  source_url: string;
  author: string;
  summary: string;
  content: string;
  cover_image: string;
  published_at: string;
  topic_name: string;
  tags?: string;
}

export default function ArticleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', summary: '', tags: '' });

  useEffect(() => {
    fetch(`/api/articles/${params.id}`).then(r => r.json()).then(data => {
      setArticle(data);
      setForm({
        title: data.title || '',
        content: data.content || '',
        summary: data.summary || '',
        tags: data.tags || '',
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [params.id]);

  const handleSave = async () => {
    await fetch(`/api/articles/${article!.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...article,
        ...form,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      }),
    });
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!confirm('确定要删除这篇文章吗？')) return;
    await fetch(`/api/articles/${article!.id}`, { method: 'DELETE' });
    router.push('/articles');
  };

  if (loading) return <div className="text-center py-16 text-gray-500">Loading...</div>;
  if (!article) return <div className="text-center py-16 text-gray-500">未找到</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <button onClick={() => router.push('/articles')} className="text-xs text-gray-500 hover:text-gray-300 mb-2 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          返回列表
        </button>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white">{article.title}</h1>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
              {article.source_name && <span className="text-emerald-400/70">{article.source_name}</span>}
              {article.author && <span>{article.author}</span>}
              {article.published_at && <span>{new Date(article.published_at).toLocaleDateString('zh-CN')}</span>}
              {article.topic_name && <span className="px-2 py-0.5 bg-emerald-900/20 text-emerald-400/80 rounded">{article.topic_name}</span>}
            </div>
          </div>
          <div className="flex gap-2 ml-4">
            <button onClick={() => setEditing(!editing)} className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">
              {editing ? '取消' : '编辑'}
            </button>
            <button onClick={handleDelete} className="px-3 py-1.5 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg transition-colors">
              删除
            </button>
          </div>
        </div>
        {article.source_url && (
          <a href={article.source_url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:underline mt-2 inline-block">
            查看原文 →
          </a>
        )}
        {article.tags && (
          <div className="flex gap-1.5 mt-2">
            {article.tags.split(',').map(tag => (
              <span key={tag} className="text-[10px] px-2 py-0.5 bg-emerald-900/20 text-emerald-400/70 rounded">{tag}</span>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">正文</h2>
          {editing && (
            <button onClick={handleSave} className="px-3 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">保存</button>
          )}
        </div>
        {editing ? (
          <>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 mb-3 focus:outline-none focus:border-emerald-500/50" />
            <input value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })}
              placeholder="摘要" className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-300 mb-3 focus:outline-none focus:border-emerald-500/50" />
            <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })}
              rows={20} className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 text-xs text-gray-300 resize-y focus:outline-none focus:border-emerald-500/50" />
            <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })}
              placeholder="标签（逗号分隔）" className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-300 mt-3 focus:outline-none focus:border-emerald-500/50" />
          </>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            {article.summary && (
              <p className="text-xs text-gray-400 italic mb-4 border-l-2 border-emerald-500/30 pl-3">{article.summary}</p>
            )}
            <div className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed">
              {article.content || '暂无正文内容'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
