'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

function SearchResults() {
  const searchParams = useSearchParams();
  const q = searchParams.get('q') || '';
  const [results, setResults] = useState<{ speeches: any[]; articles: any[] }>({ speeches: [], articles: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!q) { setLoading(false); return; }
    fetch(`/api/search?q=${encodeURIComponent(q)}`).then(r => r.json()).then(data => {
      setResults(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [q]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">搜索结果</h1>
        <p className="text-xs text-gray-500 mt-1">关键词: &quot;{q}&quot;</p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500 text-sm">搜索中...</div>
      ) : (
        <>
          {/* Speeches */}
          {results.speeches.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-blue-400">科技研讨会 ({results.speeches.length})</h2>
              {results.speeches.map((s: any) => (
                <Link key={s.id} href={`/speeches/${s.id}`}
                  className="block bg-gray-900/30 border border-gray-800/40 rounded-xl p-4 hover:bg-gray-800/30 transition-colors">
                  <h3 className="text-sm font-semibold text-gray-200">{s.title}</h3>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
                    {s.speaker && <span>{s.speaker}</span>}
                    {s.conference && <span>{s.conference}</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Articles */}
          {results.articles.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-emerald-400">公众号文章 ({results.articles.length})</h2>
              {results.articles.map((a: any) => (
                <Link key={a.id} href={`/articles/${a.id}`}
                  className="block bg-gray-900/30 border border-gray-800/40 rounded-xl p-4 hover:bg-gray-800/30 transition-colors">
                  <h3 className="text-sm font-semibold text-gray-200">{a.title}</h3>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500">
                    {a.source_name && <span className="text-emerald-400/70">{a.source_name}</span>}
                  </div>
                  {a.summary && <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{a.summary}</p>}
                </Link>
              ))}
            </div>
          )}

          {results.speeches.length === 0 && results.articles.length === 0 && (
            <div className="text-center py-16 text-gray-600 text-sm">没有找到匹配的结果</div>
          )}
        </>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="text-center py-16 text-gray-500">Loading...</div>}>
      <SearchResults />
    </Suspense>
  );
}
