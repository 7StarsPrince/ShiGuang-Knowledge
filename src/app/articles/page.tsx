'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Article {
  id: number;
  title: string;
  source_name: string;
  author: string;
  summary: string;
  published_at: string;
  created_at: string;
  tags?: string;
}

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/articles?limit=100').then(r => r.json()).then(data => {
      setArticles(data.data || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">公众号文章</h1>
          <p className="text-xs text-gray-500 mt-1">共 {articles.length} 篇收藏</p>
        </div>
        <Link href="/articles/save" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-lg transition-colors">
          + 收藏文章
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500 text-sm">Loading...</div>
      ) : articles.length === 0 ? (
        <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-12 text-center">
          <p className="text-gray-600 text-sm">还没有收藏文章</p>
          <Link href="/articles/save" className="text-emerald-400 text-xs mt-2 inline-block hover:underline">收藏第一篇文章</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {articles.map(a => (
            <Link key={a.id} href={`/articles/${a.id}`}
              className="block bg-gray-900/30 border border-gray-800/40 rounded-xl p-4 hover:bg-gray-800/30 transition-colors">
              <h3 className="text-sm font-semibold text-gray-200 line-clamp-2">{a.title}</h3>
              <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-500">
                {a.source_name && <span className="text-emerald-400/70">{a.source_name}</span>}
                {a.author && <span>{a.author}</span>}
                {(a.published_at || a.created_at) && (
                  <span>{new Date(a.published_at || a.created_at).toLocaleDateString('zh-CN')}</span>
                )}
              </div>
              {a.summary && (
                <p className="text-[11px] text-gray-500 mt-2 line-clamp-2">{a.summary}</p>
              )}
              {a.tags && (
                <div className="flex gap-1.5 mt-2">
                  {a.tags.split(',').map(tag => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-emerald-900/20 text-emerald-400/70 rounded">{tag}</span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
