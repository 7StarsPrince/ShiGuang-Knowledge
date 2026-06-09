'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Stats {
  speechCount: number;
  articleCount: number;
  tagCount: number;
  topicCount: number;
}

interface RecentItem {
  id: number;
  title: string;
  type: 'speech' | 'article';
  date: string;
  tags?: string;
}

export default function Home() {
  const [stats, setStats] = useState<Stats>({ speechCount: 0, articleCount: 0, tagCount: 0, topicCount: 0 });
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/speeches?limit=100').then(r => r.json()),
      fetch('/api/articles?limit=100').then(r => r.json()),
      fetch('/api/tags').then(r => r.json()),
      fetch('/api/topics').then(r => r.json()),
    ]).then(([speeches, articles, tags, topics]) => {
      setStats({
        speechCount: speeches.total || 0,
        articleCount: articles.total || 0,
        tagCount: tags.length || 0,
        topicCount: Array.isArray(topics) ? topics.length : 0,
      });

      // Merge recent items
      const items: RecentItem[] = [
        ...(speeches.data || []).map((s: any) => ({
          id: s.id, title: s.title, type: 'speech' as const,
          date: s.speech_date || s.created_at, tags: s.tags,
        })),
        ...(articles.data || []).map((a: any) => ({
          id: a.id, title: a.title, type: 'article' as const,
          date: a.created_at, tags: a.tags,
        })),
      ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).slice(0, 10);

      setRecent(items);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">拾光知识库</h1>
        <p className="text-sm text-gray-500 mt-1">你的私人知识仓库 — 峰会演讲 & 公众号文章</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Link href="/topics" className="bg-gray-900/40 border border-gray-800/40 rounded-xl p-5 hover:bg-gray-800/30 transition-colors">
          <div className="text-3xl font-bold text-emerald-400">{stats.topicCount}</div>
          <div className="text-xs text-gray-500 mt-1">话题</div>
        </Link>
        <div className="bg-gray-900/40 border border-gray-800/40 rounded-xl p-5">
          <div className="text-3xl font-bold text-blue-400">{stats.speechCount}</div>
          <div className="text-xs text-gray-500 mt-1">峰会演讲</div>
        </div>
        <div className="bg-gray-900/40 border border-gray-800/40 rounded-xl p-5">
          <div className="text-3xl font-bold text-purple-400">{stats.articleCount}</div>
          <div className="text-xs text-gray-500 mt-1">公众号文章</div>
        </div>
        <div className="bg-gray-900/40 border border-gray-800/40 rounded-xl p-5">
          <div className="text-3xl font-bold text-amber-400">{stats.tagCount}</div>
          <div className="text-xs text-gray-500 mt-1">标签</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-4">
        <Link href="/topics" className="bg-emerald-600/10 border border-emerald-500/20 rounded-xl p-5 hover:bg-emerald-600/20 transition-colors">
          <div className="text-sm font-semibold text-emerald-400">话题管理</div>
          <div className="text-xs text-gray-500 mt-1">按话题分类管理演讲和文章</div>
        </Link>
        <Link href="/speeches/upload" className="bg-blue-600/10 border border-blue-500/20 rounded-xl p-5 hover:bg-blue-600/20 transition-colors">
          <div className="text-sm font-semibold text-blue-400">上传演讲</div>
          <div className="text-xs text-gray-500 mt-1">上传讯飞听见打包文件</div>
        </Link>
        <Link href="/articles/save" className="bg-purple-600/10 border border-purple-500/20 rounded-xl p-5 hover:bg-purple-600/20 transition-colors">
          <div className="text-sm font-semibold text-purple-400">收藏文章</div>
          <div className="text-xs text-gray-500 mt-1">保存公众号优质内容</div>
        </Link>
      </div>

      {/* Recent Items */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 mb-3">最近添加</h2>
        {recent.length === 0 ? (
          <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-8 text-center">
            <p className="text-gray-600 text-sm">还没有内容，开始添加你的第一个知识条目吧</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map(item => (
              <Link
                key={`${item.type}-${item.id}`}
                href={`/${item.type === 'speech' ? 'speeches' : 'articles'}/${item.id}`}
                className="block bg-gray-900/30 border border-gray-800/40 rounded-lg px-4 py-3 hover:bg-gray-800/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    item.type === 'speech'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {item.type === 'speech' ? '演讲' : '文章'}
                  </span>
                  <span className="text-sm text-gray-300 flex-1 truncate">{item.title}</span>
                  {item.date && (
                    <span className="text-[10px] text-gray-600">
                      {new Date(item.date).toLocaleDateString('zh-CN')}
                    </span>
                  )}
                </div>
                {item.tags && (
                  <div className="flex gap-1.5 mt-1.5 ml-14">
                    {item.tags.split(',').map((tag: string) => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-gray-800/50 text-gray-500 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
