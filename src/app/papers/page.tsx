'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Paper {
  id: number;
  title: string;
  authors: string;
  journal: string;
  year: string;
  doi: string;
  keywords: string;
  created_at: string;
  tags?: string;
  topic_name?: string;
  topic_id?: number;
}

export default function PapersPage() {
  const router = useRouter();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [topicOpen, setTopicOpen] = useState(false);
  const topicRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/papers?limit=200').then(r => r.json()).then(data => {
      setPapers(data.data || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (topicRef.current && !topicRef.current.contains(e.target as Node)) setTopicOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这篇论文吗？')) return;
    const res = await fetch(`/api/papers/${id}`, { method: 'DELETE' });
    if (res.ok) setPapers(prev => prev.filter(p => p.id !== id));
    else alert('删除失败');
  };

  // Extract unique topic names
  const topicNames = Array.from(new Set(papers.map(p => p.topic_name).filter(Boolean))) as string[];

  const filteredPapers = papers.filter(p => {
    if (selectedTopic && p.topic_name !== selectedTopic) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return p.title.toLowerCase().includes(q)
        || (p.authors && p.authors.toLowerCase().includes(q))
        || (p.journal && p.journal.toLowerCase().includes(q))
        || (p.keywords && p.keywords.toLowerCase().includes(q))
        || (p.tags && p.tags.toLowerCase().includes(q));
    }
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">学术论文集</h1>
          <p className="text-xs text-gray-500 mt-1">共 {papers.length} 篇论文{selectedTopic ? `，当前: ${selectedTopic}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {topicNames.length > 0 && (
            <div ref={topicRef} className="relative">
              <button onClick={() => setTopicOpen(!topicOpen)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${selectedTopic ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-400' : 'bg-gray-800/60 border-gray-700/40 text-gray-400 hover:text-gray-200'}`}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                {selectedTopic || '话题'}
                {selectedTopic && (
                  <span onClick={(e) => { e.stopPropagation(); setSelectedTopic(''); }} className="ml-1 hover:text-white">x</span>
                )}
              </button>
              {topicOpen && (
                <div className="absolute top-full mt-1 right-0 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 min-w-[160px] max-h-60 overflow-y-auto">
                  {topicNames.map(t => (
                    <button key={t} onClick={() => { setSelectedTopic(selectedTopic === t ? '' : t); setTopicOpen(false); }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700/60 transition-colors ${selectedTopic === t ? 'text-emerald-400' : 'text-gray-300'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索标题、作者、期刊..."
              className="pl-8 pr-3 py-1.5 text-xs bg-gray-800/60 border border-gray-700/40 rounded-lg text-gray-300 placeholder-gray-600 focus:outline-none focus:border-amber-500/40 w-56" />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          <Link href="/papers/save" className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs rounded-lg transition-colors">
            + 添加论文
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500 text-sm">Loading...</div>
      ) : filteredPapers.length === 0 ? (
        <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-12 text-center">
          <p className="text-gray-600 text-sm">{searchQuery || selectedTopic ? '没有找到匹配的论文' : '还没有收藏论文'}</p>
          {!searchQuery && !selectedTopic && <Link href="/papers/save" className="text-amber-400 text-xs mt-2 inline-block hover:underline">添加第一篇论文</Link>}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPapers.map(p => (
            <div key={p.id} className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-4 hover:bg-gray-800/30 transition-colors">
              <div className="flex items-start justify-between">
                <Link href={`/papers/${p.id}`} className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-200 truncate hover:text-white transition-colors">{p.title}</h3>
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-500">
                    {p.authors && <span className="truncate max-w-[200px]">{p.authors.split(',').slice(0, 3).join(', ')}{p.authors.split(',').length > 3 ? ' et al.' : ''}</span>}
                    {p.journal && <span className="text-amber-400/70 italic">{p.journal}</span>}
                    {p.year && <span>{p.year}</span>}
                    {p.doi && <span className="text-gray-600">DOI: {p.doi}</span>}
                  </div>
                  {(p.topic_name || p.tags) && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {p.topic_name && <span className="text-[10px] px-2 py-0.5 bg-emerald-900/20 text-emerald-400/80 rounded">{p.topic_name}</span>}
                      {p.tags && p.tags.split(',').map(tag => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-amber-900/20 text-amber-400/70 rounded">{tag}</span>
                      ))}
                    </div>
                  )}
                </Link>
                <div className="flex items-center gap-1.5 ml-3 flex-shrink-0">
                  <button onClick={() => router.push(`/papers/${p.id}?edit=1`)}
                    className="px-2.5 py-1 text-[11px] bg-gray-800/60 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-md transition-colors">编辑</button>
                  <button onClick={() => handleDelete(p.id)}
                    className="px-2.5 py-1 text-[11px] bg-red-900/20 hover:bg-red-900/40 text-red-400/70 hover:text-red-400 rounded-md transition-colors">删除</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
