'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Speech {
  id: number;
  title: string;
  conference: string;
  speaker: string;
  speech_date: string;
  tags?: string;
  topic_name?: string;
}

export default function SpeechesPage() {
  const router = useRouter();
  const [speeches, setSpeeches] = useState<Speech[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchSpeeches = () => {
    fetch('/api/speeches?limit=100').then(r => r.json()).then(data => {
      setSpeeches(data.data || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { fetchSpeeches(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这条演讲记录吗？删除后无法恢复。')) return;
    const res = await fetch(`/api/speeches/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setSpeeches(prev => prev.filter(s => s.id !== id));
    } else {
      alert('删除失败');
    }
    setDeletingId(null);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">峰会演讲</h1>
          <p className="text-xs text-gray-500 mt-1">共 {speeches.length} 条记录</p>
        </div>
        <Link href="/speeches/upload" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition-colors">
          + 导入演讲
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500 text-sm">Loading...</div>
      ) : speeches.length === 0 ? (
        <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-12 text-center">
          <p className="text-gray-600 text-sm">还没有演讲记录</p>
          <Link href="/speeches/upload" className="text-blue-400 text-xs mt-2 inline-block hover:underline">导入第一个演讲</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {speeches.map(s => (
            <div key={s.id}
              className="block bg-gray-900/30 border border-gray-800/40 rounded-xl p-4 hover:bg-gray-800/30 transition-colors">
              <div className="flex items-start justify-between">
                <Link href={`/speeches/${s.id}`} className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-200 truncate hover:text-white transition-colors">{s.title}</h3>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500">
                    {s.speaker && <span>{s.speaker}</span>}
                    {s.conference && <span>{s.conference}</span>}
                    {s.speech_date && <span>{new Date(s.speech_date).toLocaleDateString('zh-CN')}</span>}
                  </div>
                </Link>
                <div className="flex items-center gap-1.5 ml-3 flex-shrink-0">
                  <button
                    onClick={() => router.push(`/speeches/${s.id}?edit=1`)}
                    className="px-2.5 py-1 text-[11px] bg-gray-800/60 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-md transition-colors"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="px-2.5 py-1 text-[11px] bg-red-900/20 hover:bg-red-900/40 text-red-400/70 hover:text-red-400 rounded-md transition-colors"
                  >
                    删除
                  </button>
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
