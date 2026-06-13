'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const navItems = [
  { href: '/', label: '首页', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { href: '/speeches', label: '科技研讨会', icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z' },
  { href: '/articles', label: '公众号文章', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { href: '/papers', label: '学术论文集', icon: 'M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222' },
  { href: '/ai', label: 'AI 分析与生成', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/search?q=${encodeURIComponent(searchQuery.trim())}`;
    }
  };

  return (
    <aside className={`fixed left-0 top-0 bottom-0 bg-[#0d1520] border-r border-slate-700/20 flex flex-col z-50 transition-[width] duration-300 ${collapsed ? 'w-[60px]' : 'w-56'}`}>
      {/* Logo / Toggle */}
      <div className={`p-4 border-b border-slate-700/20 ${collapsed ? 'flex flex-col items-center gap-2' : 'flex items-center justify-between'}`}>
        {!collapsed && (
          <div className="flex items-center gap-3 min-w-0">
            {/* AWKN Logo */}
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <span className="text-sm font-black tracking-[0.2em] text-white leading-none text-center">AW<br />KN</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-white leading-tight">
                <span className="italic" style={{ fontSize: '0.8em' }}>亚当斯王</span><span className="text-emerald-400 italic" style={{ fontFamily: '"STXingkai", "华文行楷", cursive', fontSize: '0.7em' }}>de</span><br /><b>拾光知识库</b>
              </h1>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <span className="text-sm font-black tracking-[0.15em] text-white leading-none text-center">AW<br />KN</span>
          </div>
        )}
        <button
          onClick={onToggle}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-700/40 transition-colors"
          title={collapsed ? '展开侧栏' : '收起侧栏'}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {collapsed
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />}
          </svg>
        </button>
      </div>

      {/* Search */}
      {!collapsed && (
        <form onSubmit={handleSearch} className="px-4 py-3">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索..."
            className="w-full bg-[#162030]/60 border border-slate-600/20 rounded-lg px-3 py-1.5 text-xs text-slate-300 placeholder-slate-500 focus:outline-none focus:border-sky-500/40"
          />
        </form>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-2 space-y-0.5">
        {navItems.map(item => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs transition-colors ${collapsed ? 'justify-center' : ''} ${
                isActive
                  ? 'bg-sky-500/12 text-sky-400'
                  : 'text-slate-400 hover:bg-slate-700/25 hover:text-slate-200'
              }`}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
              </svg>
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={`p-3 border-t border-slate-700/20 ${collapsed ? 'text-center' : ''}`}>
        {!collapsed && (
          <>
            <p className="text-[10px] text-slate-600">Powered by Next.js + SQLite</p>
            <p className="text-[10px] text-slate-500 mt-0.5">V202606132128</p>
          </>
        )}
      </div>
    </aside>
  );
}
