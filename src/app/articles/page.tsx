'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Article {
  id: number;
  title: string;
  source_name: string;
  author: string;
  summary: string;
  published_at: string;
  created_at: string;
  tags?: string;
  topic_name?: string;
}

export default function ArticlesPage() {
  const router = useRouter();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [topicOpen, setTopicOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const topicRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/articles?limit=100').then(r => r.json()).then(data => {
      setArticles(data.data || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (topicRef.current && !topicRef.current.contains(e.target as Node)) setTopicOpen(false);
      if (tagRef.current && !tagRef.current.contains(e.target as Node)) setTagOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Extract unique topics and tags from data
  const topicOptions = Array.from(new Set(articles.filter(a => a.topic_name).map(a => a.topic_name!))).sort();
  const tagOptions = Array.from(new Set(articles.flatMap(a => (a.tags || '').split(',').map(t => t.trim()).filter(Boolean)))).sort();

  const filteredArticles = articles.filter(a => {
    if (selectedTopic && a.topic_name !== selectedTopic) return false;
    if (selectedTag && !(a.tags || '').split(',').map(t => t.trim()).includes(selectedTag)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return a.title.toLowerCase().includes(q)
        || (a.author && a.author.toLowerCase().includes(q))
        || (a.source_name && a.source_name.toLowerCase().includes(q))
        || (a.tags && a.tags.toLowerCase().includes(q));
    }
    return true;
  });

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这篇文章吗？删除后无法恢复。')) return;
    const res = await fetch(`/api/articles/${id}`, { method: 'DELETE' });
    if (res.ok) setArticles(prev => prev.filter(a => a.id !== id));
    else alert('删除失败');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">公众号文章</h1>
          <p className="text-xs text-gray-500 mt-1">共 {articles.length} 篇收藏{filteredArticles.length !== articles.length ? `，筛选 ${filteredArticles.length} 篇` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Topic dropdown */}
          <div ref={topicRef} className="relative">
            <button onClick={() => { setTopicOpen(!topicOpen); setTagOpen(false); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${selectedTopic ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-400' : 'bg-gray-800/60 border-gray-700/40 text-gray-400 hover:text-gray-200'}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
              {selectedTopic || '话题'}
              {selectedTopic && (
                <span onClick={(e) => { e.stopPropagation(); setSelectedTopic(''); }}
                  className="ml-0.5 hover:text-white">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </span>
              )}
              <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {topicOpen && topicOptions.length > 0 && (
              <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700/50 rounded-lg shadow-xl py-1 z-50 min-w-[160px] max-h-60 overflow-y-auto">
                {topicOptions.map(t => (
                  <button key={t} onClick={() => { setSelectedTopic(selectedTopic === t ? '' : t); setTopicOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700/60 transition-colors ${selectedTopic === t ? 'text-emerald-400' : 'text-gray-300'}`}>
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tag dropdown */}
          <div ref={tagRef} className="relative">
            <button onClick={() => { setTagOpen(!tagOpen); setTopicOpen(false); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${selectedTag ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-400' : 'bg-gray-800/60 border-gray-700/40 text-gray-400 hover:text-gray-200'}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>
              {selectedTag || '标签'}
              {selectedTag && (
                <span onClick={(e) => { e.stopPropagation(); setSelectedTag(''); }}
                  className="ml-0.5 hover:text-white">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </span>
              )}
              <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {tagOpen && tagOptions.length > 0 && (
              <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700/50 rounded-lg shadow-xl py-1 z-50 min-w-[160px] max-h-60 overflow-y-auto">
                {tagOptions.map(t => (
                  <button key={t} onClick={() => { setSelectedTag(selectedTag === t ? '' : t); setTagOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700/60 transition-colors ${selectedTag === t ? 'text-emerald-400' : 'text-gray-300'}`}>
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索标题、作者、来源..."
              className="pl-8 pr-3 py-1.5 text-xs bg-gray-800/60 border border-gray-700/40 rounded-lg text-gray-300 placeholder-gray-600 focus:outline-none focus:border-emerald-500/40 w-56"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          <Link href="/articles/save" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-lg transition-colors">
            + 收藏文章
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500 text-sm">Loading...</div>
      ) : filteredArticles.length === 0 ? (
        <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-12 text-center">
          <p className="text-gray-600 text-sm">{searchQuery || selectedTopic || selectedTag ? '没有找到匹配的文章' : '还没有收藏文章'}</p>
          {!searchQuery && !selectedTopic && !selectedTag && <Link href="/articles/save" className="text-emerald-400 text-xs mt-2 inline-block hover:underline">收藏第一篇文章</Link>}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredArticles.map(a => (
            <div key={a.id}
              className="block bg-gray-900/30 border border-gray-800/40 rounded-xl p-4 hover:bg-gray-800/30 transition-colors">
              <div className="flex items-start justify-between">
                <Link href={`/articles/${a.id}`} className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-200 truncate hover:text-white transition-colors">{a.title}</h3>
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-500">
                    {a.source_name && <span className="text-emerald-400/70">{a.source_name}</span>}
                    {a.author && <span>{a.author}</span>}
                    {(a.published_at || a.created_at) && (
                      <span>{new Date(a.published_at || a.created_at).toLocaleDateString('zh-CN')}</span>
                    )}
                  </div>
                  {a.summary && <p className="text-[11px] text-gray-500 mt-1.5 line-clamp-2">{a.summary}</p>}
                </Link>
                <div className="flex items-center gap-1.5 ml-3 flex-shrink-0">
                  <button onClick={() => router.push(`/articles/${a.id}?edit=1`)}
                    className="px-2.5 py-1 text-[11px] bg-gray-800/60 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-md transition-colors">编辑</button>
                  <button onClick={() => handleDelete(a.id)}
                    className="px-2.5 py-1 text-[11px] bg-red-900/20 hover:bg-red-900/40 text-red-400/70 hover:text-red-400 rounded-md transition-colors">删除</button>
                </div>
              </div>
              {(a.topic_name || a.tags) && (
                <div className="flex gap-1.5 mt-2">
                  {a.topic_name && <span className="text-[10px] px-2 py-0.5 bg-emerald-900/20 text-emerald-400/80 rounded">{a.topic_name}</span>}
                  {a.tags && a.tags.split(',').map(tag => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-emerald-900/20 text-emerald-400/70 rounded">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
