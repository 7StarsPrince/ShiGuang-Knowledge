'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Speech {
  id: number;
  title: string;
  conference: string;
  speaker: string;
  speaker_org: string;
  speech_date: string;
  tags?: string;
  topic_name?: string;
  topic_id?: number;
}

export default function SpeechesPage() {
  const router = useRouter();
  const [speeches, setSpeeches] = useState<Speech[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [topicOpen, setTopicOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const topicRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/speeches?limit=100').then(r => r.json()).then(data => {
      setSpeeches(data.data || []);
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
  const topicOptions = Array.from(new Set(speeches.filter(s => s.topic_name).map(s => s.topic_name!))).sort();
  const tagOptions = Array.from(new Set(speeches.flatMap(s => (s.tags || '').split(',').map(t => t.trim()).filter(Boolean)))).sort();

  const filteredSpeeches = speeches.filter(s => {
    if (selectedTopic && s.topic_name !== selectedTopic) return false;
    if (selectedTag && !(s.tags || '').split(',').map(t => t.trim()).includes(selectedTag)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return s.title.toLowerCase().includes(q)
        || (s.speaker && s.speaker.toLowerCase().includes(q))
        || (s.speaker_org && s.speaker_org.toLowerCase().includes(q))
        || (s.conference && s.conference.toLowerCase().includes(q))
        || (s.tags && s.tags.toLowerCase().includes(q));
    }
    return true;
  });

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这条演讲记录吗？删除后无法恢复。')) return;
    const res = await fetch(`/api/speeches/${id}`, { method: 'DELETE' });
    if (res.ok) setSpeeches(prev => prev.filter(s => s.id !== id));
    else alert('删除失败');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">科技研讨会</h1>
          <p className="text-xs text-slate-400 mt-1">共 {speeches.length} 条记录{filteredSpeeches.length !== speeches.length ? `，筛选 ${filteredSpeeches.length} 条` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Topic dropdown */}
          <div ref={topicRef} className="relative">
            <button onClick={() => { setTopicOpen(!topicOpen); setTagOpen(false); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${selectedTopic ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-400' : 'bg-[#162030]/60 border-slate-600/20 text-slate-400 hover:text-slate-100'}`}>
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
              <div className="absolute right-0 top-full mt-1 bg-[#1a2535] border border-slate-600/20 rounded-lg shadow-xl py-1 z-50 min-w-[160px] max-h-60 overflow-y-auto">
                {topicOptions.map(t => (
                  <button key={t} onClick={() => { setSelectedTopic(selectedTopic === t ? '' : t); setTopicOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#2a3a4c]/50 transition-colors ${selectedTopic === t ? 'text-emerald-400' : 'text-slate-200'}`}>
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tag dropdown */}
          <div ref={tagRef} className="relative">
            <button onClick={() => { setTagOpen(!tagOpen); setTopicOpen(false); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${selectedTag ? 'bg-blue-900/20 border-blue-500/30 text-blue-400' : 'bg-[#162030]/60 border-slate-600/20 text-slate-400 hover:text-slate-100'}`}>
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
              <div className="absolute right-0 top-full mt-1 bg-[#1a2535] border border-slate-600/20 rounded-lg shadow-xl py-1 z-50 min-w-[160px] max-h-60 overflow-y-auto">
                {tagOptions.map(t => (
                  <button key={t} onClick={() => { setSelectedTag(selectedTag === t ? '' : t); setTagOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#2a3a4c]/50 transition-colors ${selectedTag === t ? 'text-blue-400' : 'text-slate-200'}`}>
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索标题、演讲者、会议..."
              className="pl-8 pr-3 py-1.5 text-xs bg-[#162030]/60 border border-slate-600/20 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/40 w-56"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          <Link href="/speeches/upload" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition-colors">
            + 导入演讲
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-500 text-sm">Loading...</div>
      ) : filteredSpeeches.length === 0 ? (
        <div className="bg-[#1e2c3e]/50 border border-slate-600/20 rounded-xl p-12 text-center">
          <p className="text-slate-600 text-sm">{searchQuery || selectedTopic || selectedTag ? '没有找到匹配的记录' : '还没有演讲记录'}</p>
          {!searchQuery && !selectedTopic && !selectedTag && <Link href="/speeches/upload" className="text-blue-400 text-xs mt-2 inline-block hover:underline">导入第一个演讲</Link>}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSpeeches.map(s => (
            <div key={s.id}
              className="block bg-[#1e2c3e]/50 border border-slate-600/20 rounded-xl p-4 hover:bg-[#2a3a4c]/50 transition-colors">
              <div className="flex items-start justify-between">
                <Link href={`/speeches/${s.id}`} className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-slate-100 truncate hover:text-white transition-colors">{s.title}</h3>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500">
                    {s.speaker && <span>{s.speaker}{s.speaker_org ? ` (${s.speaker_org})` : ''}</span>}
                    {s.conference && <span>{s.conference}</span>}
                    {s.speech_date && <span>{new Date(s.speech_date).toLocaleDateString('zh-CN')}</span>}
                  </div>
                </Link>
                <div className="flex items-center gap-1.5 ml-3 flex-shrink-0">
                  <button onClick={() => router.push(`/speeches/${s.id}?edit=1`)}
                    className="px-2.5 py-1 text-[11px] bg-gray-800/60 hover:bg-gray-700 text-gray-400 hover:text-slate-100 rounded-md transition-colors">编辑</button>
                  <button onClick={() => handleDelete(s.id)}
                    className="px-2.5 py-1 text-[11px] bg-red-900/20 hover:bg-red-900/40 text-red-400/70 hover:text-red-400 rounded-md transition-colors">删除</button>
                </div>
              </div>
              {(s.topic_name || s.tags) && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {s.topic_name && (
                    <span className="text-[10px] px-2 py-0.5 bg-emerald-900/20 text-emerald-400/80 rounded">{s.topic_name}</span>
                  )}
                  {s.tags && s.tags.split(',').map(tag => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-blue-900/20 text-blue-400/70 rounded">{tag}</span>
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
