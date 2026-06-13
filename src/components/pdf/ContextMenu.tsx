'use client';

import { useEffect, useRef } from 'react';

interface ContextMenuProps {
  x: number;
  y: number;
  onTranslate: () => void;
  onTTS: () => void;
  onExplain: () => void;
  onClose: () => void;
}

const MENU_WIDTH = 160;
const MENU_HEIGHT = 120;

export default function ContextMenu({ x, y, onTranslate, onTTS, onExplain, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Boundary detection
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = x + MENU_WIDTH > vw ? vw - MENU_WIDTH - 8 : x;
  const top = y + MENU_HEIGHT > vh ? vh - MENU_HEIGHT - 8 : y;

  const items = [
    { label: '翻译', icon: '🌐', action: onTranslate },
    { label: '语音阅读', icon: '🔊', action: onTTS },
    { label: 'AI 解释', icon: '💡', action: onExplain },
  ];

  return (
    <div
      ref={ref}
      className="fixed z-[200] bg-[#2a2a2a] border border-gray-700/60 rounded-lg shadow-2xl py-1 min-w-[140px]"
      style={{ left, top }}
    >
      {items.map(({ label, icon, action }) => (
        <button
          key={label}
          onClick={() => { action(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700/50 transition-colors"
        >
          <span className="text-base">{icon}</span>
          {label}
        </button>
      ))}
    </div>
  );
}
