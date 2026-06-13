'use client';

interface TTSControlsProps {
  speaking: boolean;
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export default function TTSControls({ speaking, paused, onPause, onResume, onStop }: TTSControlsProps) {
  if (!speaking) return null;

  return (
    <div className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
      <span className="text-[10px] text-emerald-400/60 mr-1">
        {paused ? '已暂停' : '朗读中...'}
      </span>
      {paused ? (
        <button onClick={onResume} className="w-7 h-7 flex items-center justify-center bg-gray-800/60 hover:bg-gray-700 rounded-full text-gray-400 transition-colors" title="继续">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        </button>
      ) : (
        <button onClick={onPause} className="w-7 h-7 flex items-center justify-center bg-gray-800/60 hover:bg-gray-700 rounded-full text-gray-400 transition-colors" title="暂停">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
        </button>
      )}
      <button onClick={onStop} className="w-7 h-7 flex items-center justify-center bg-gray-800/60 hover:bg-gray-700 rounded-full text-gray-400 transition-colors" title="停止">
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
      </button>
    </div>
  );
}
