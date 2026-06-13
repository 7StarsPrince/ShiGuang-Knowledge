'use client';

interface SidePanelProps {
  mode: 'translate' | 'explain' | 'ocr';
  content: string;
  loading: boolean;
  selectedText: string;
  onClose: () => void;
  onSaveToNotes?: () => void;
  saved?: boolean;
}

export default function SidePanel({ mode, content, loading, selectedText, onClose, onSaveToNotes, saved }: SidePanelProps) {
  const modeConfig = {
    translate: { icon: '🌐', label: '中文翻译' },
    explain: { icon: '💡', label: 'AI 解释' },
    ocr: { icon: '🔍', label: 'OCR 识别结果' },
  };
  const cfg = modeConfig[mode];

  return (
    <div className="w-[420px] border-l border-gray-800/40 flex flex-col bg-[#1a1a1a] shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/40 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm">{cfg.icon}</span>
          <h3 className="text-sm font-semibold text-white">{cfg.label}</h3>
        </div>
        <div className="flex items-center gap-2">
          {onSaveToNotes && !loading && (
            <button
              onClick={onSaveToNotes}
              disabled={saved}
              className={`px-2 py-1 text-[10px] rounded transition-colors ${
                saved
                  ? 'bg-emerald-900/30 text-emerald-400 cursor-default'
                  : 'bg-cyan-900/30 hover:bg-cyan-900/50 text-cyan-400'
              }`}
            >
              {saved ? '已保存' : '保存到笔记'}
            </button>
          )}
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Original text */}
        <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-700/30">
          <span className="text-[10px] text-gray-500 mb-1.5 block">{mode === 'ocr' ? '识别来源' : '原文'}</span>
          <p className="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto">
            {selectedText}
          </p>
        </div>

        {/* Result */}
        {loading ? (
          <div className="space-y-3">
            <div className="h-4 bg-gray-800/50 rounded animate-pulse w-3/4" />
            <div className="h-4 bg-gray-800/50 rounded animate-pulse w-full" />
            <div className="h-4 bg-gray-800/50 rounded animate-pulse w-5/6" />
            <div className="h-4 bg-gray-800/50 rounded animate-pulse w-2/3" />
          </div>
        ) : (
          <div className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
            {content}
          </div>
        )}
      </div>
    </div>
  );
}
