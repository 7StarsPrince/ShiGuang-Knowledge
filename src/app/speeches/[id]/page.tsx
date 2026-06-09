'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import WaveSurfer from 'wavesurfer.js';

interface Slide { id: number; slide_order: number; slide_time: number; image_path: string; }
interface TranscriptParagraph { pTime: number[]; role: string; words: Array<{ text: string; time: number[]; wp: string }>; }
interface Speech {
  id: number; title: string; conference: string; speaker: string; speech_date: string;
  transcript: string; transcript_json: string; audio_path: string; audio_duration: number;
  audio_enhanced_path: string; audio_enhanced_demucs_path: string;
  transcript_demucs_json: string; demucs_passes: number;
  notes: string; source_url: string; topic: string;
  topic_id: number | null; topic_name: string; tags?: string; slides: Slide[];
}

interface TopicOption {
  id: number;
  name: string;
  children: TopicOption[];
}

// ─── Topic helpers ─────────────────────────────────────────────────────────

function toTopicOption(t: any): TopicOption {
  return {
    id: t.id,
    name: t.name,
    children: (t.children || []).map((c: any) => toTopicOption(c)),
  };
}

function flattenTopics(nodes: TopicOption[], depth = 0): Array<{ id: number; label: string }> {
  const result: Array<{ id: number; label: string }> = [];
  for (const node of nodes) {
    const indent = '\u00A0\u00A0'.repeat(depth);
    result.push({ id: node.id, label: depth > 0 ? `${indent}└ ${node.name}` : node.name });
    result.push(...flattenTopics(node.children, depth + 1));
  }
  return result;
}

// ─── Minimap Range Slider ──────────────────────────────────────────────────

function MinimapSlider({
  containerRef, rangeStart, rangeEnd, onRangeChange,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  rangeStart: number; rangeEnd: number;
  onRangeChange: (start: number, end: number, finished: boolean) => void;
}) {
  const onDown = useCallback((type: 'left' | 'right' | 'middle', e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const startClientX = e.clientX;
    const frozenStart = rangeStart;
    const frozenEnd = rangeEnd;
    let latestStart = frozenStart;
    let latestEnd = frozenEnd;

    const move = (ev: MouseEvent) => {
      const c = containerRef.current;
      if (!c) return;
      const dx = (ev.clientX - startClientX) / c.getBoundingClientRect().width;
      const min = 0.03;
      if (type === 'left') {
        latestStart = Math.max(0, Math.min(frozenEnd - min, frozenStart + dx));
        latestEnd = frozenEnd;
      } else if (type === 'right') {
        latestStart = frozenStart;
        latestEnd = Math.min(1, Math.max(frozenStart + min, frozenEnd + dx));
      } else {
        const span = frozenEnd - frozenStart;
        let ns = frozenStart + dx;
        if (ns < 0) ns = 0;
        if (ns + span > 1) ns = 1 - span;
        latestStart = ns;
        latestEnd = ns + span;
      }
      onRangeChange(latestStart, latestEnd, false);
    };
    const up = () => {
      onRangeChange(latestStart, latestEnd, true);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, [rangeStart, rangeEnd, containerRef, onRangeChange]);

  return (
    <div className="absolute inset-0 select-none" style={{ left: `${rangeStart * 100}%`, width: `${(rangeEnd - rangeStart) * 100}%` }}>
      <div onMouseDown={e => onDown('left', e)}
        className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize z-20 flex items-center justify-center hover:bg-blue-500/20">
        <div className="w-1 h-6 bg-blue-400 rounded-full" />
      </div>
      <div onMouseDown={e => onDown('middle', e)}
        className="absolute top-0 bottom-0 cursor-grab active:cursor-grabbing z-10"
        style={{ left: 12, right: 12 }}>
        <div className="w-full h-full bg-blue-500/15 rounded" />
      </div>
      <div onMouseDown={e => onDown('right', e)}
        className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize z-20 flex items-center justify-center hover:bg-blue-500/20">
        <div className="w-1 h-6 bg-blue-400 rounded-full" />
      </div>
    </div>
  );
}

// ─── Edit Form ──────────────────────────────────────────────────────────────

function EditForm({
  speech, transcript, notes, tagsInput, topics,
  onTranscriptChange, onNotesChange, onTagsChange, onFieldChange,
}: {
  speech: Speech;
  transcript: string; notes: string; tagsInput: string;
  topics: TopicOption[];
  onTranscriptChange: (v: string) => void;
  onNotesChange: (v: string) => void;
  onTagsChange: (v: string) => void;
  onFieldChange: (field: string, value: any) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-gray-400 mb-1">标题</label>
        <input value={speech.title} onChange={e => onFieldChange('title', e.target.value)}
          className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">会议名称</label>
          <input value={speech.conference || ''} onChange={e => onFieldChange('conference', e.target.value)}
            className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">演讲者</label>
          <input value={speech.speaker || ''} onChange={e => onFieldChange('speaker', e.target.value)}
            className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">演讲日期</label>
          <input type="date" value={speech.speech_date || ''} onChange={e => onFieldChange('speech_date', e.target.value)}
            className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">话题</label>
          <select value={speech.topic_id || ''} onChange={e => onFieldChange('topic_id', e.target.value ? Number(e.target.value) : null)}
            className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50">
            <option value="">不选择</option>
            {flattenTopics(topics).map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">标签（逗号分隔）</label>
        <input value={tagsInput} onChange={e => onTagsChange(e.target.value)}
          className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50" />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">字幕/转写文本</label>
        <textarea value={transcript} onChange={e => onTranscriptChange(e.target.value)} rows={15}
          className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 text-xs text-gray-300 font-mono resize-y focus:outline-none focus:border-blue-500/50" />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">个人笔记</label>
        <textarea value={notes} onChange={e => onNotesChange(e.target.value)} rows={5}
          className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 text-xs text-gray-300 resize-y focus:outline-none focus:border-blue-500/50" />
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function SpeechDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [speech, setSpeech] = useState<Speech | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(searchParams.get('edit') === '1');
  const [transcript, setTranscript] = useState('');
  const [notes, setNotes] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [currentSlide, setCurrentSlide] = useState(0);
  const manualSlideRef = useRef(false);

  // Topics for dropdown
  const [topics, setTopics] = useState<TopicOption[]>([]);

  // WaveSurfer
  const waveformRef = useRef<HTMLDivElement>(null);
  const overviewRef = useRef<HTMLDivElement>(null);
  const overviewWrapRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const overviewWsRef = useRef<WaveSurfer | null>(null);
  const wsReadyRef = useRef(false);
  const gainRef = useRef<GainNode | null>(null);
  const enhanceAbortRef = useRef<AbortController | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [waveExpanded, setWaveExpanded] = useState(false);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(1);
  const [wsReady, setWsReady] = useState(false);
  const [volume, setVolume] = useState(100);

  // Audio enhancement
  type AudioSource = 'original' | 'enhanced_demucs';
  const [audioSource, setAudioSource] = useState<AudioSource>('original');
  const [enhancing, setEnhancing] = useState(false);
  const [enhanceProgress, setEnhanceProgress] = useState(0);
  const [enhanceMessage, setEnhanceMessage] = useState('');
  const [enhanceRemaining, setEnhanceRemaining] = useState(0);
  const [demucsPasses, setDemucsPasses] = useState(1);
  const [hasDemucs, setHasDemucs] = useState(false);
  const [demucsPassesCount, setDemucsPassesCount] = useState(0);

  // Whisper transcription
  const [demucsParagraphs, setDemucsParagraphs] = useState<Array<{
    time: string; timeMs: number; role: string; roleName: string; text: string;
  }>>([]);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeProgress, setTranscribeProgress] = useState(0);
  const [transcribeMessage, setTranscribeMessage] = useState('');
  const [showTranscribeOptions, setShowTranscribeOptions] = useState(false);
  const [whisperSource, setWhisperSource] = useState<'original' | 'demucs'>('original');
  const [whisperModel, setWhisperModel] = useState('medium');

  const fileUrl = (p: string) => p ? `/api/${p}` : '';

  const [paragraphs, setParagraphs] = useState<Array<{
    time: string; timeMs: number; role: string; roleName: string; text: string;
  }>>([]);
  const [roleMap, setRoleMap] = useState<Record<string, string>>({});

  // ── Load data ──
  useEffect(() => {
    fetch(`/api/speeches/${params.id}`).then(r => r.json()).then(data => {
      setSpeech(data);
      setTranscript(data.transcript || '');
      setNotes(data.notes || '');
      setTagsInput(data.tags || '');
      if (data.transcript_json) {
        try {
          const raw = JSON.parse(data.transcript_json);
          const rMap: Record<string, string> = {};
          for (const r of (data.roles || [])) rMap[r.role] = r.name;
          const parsed = raw.map((p: TranscriptParagraph) => {
            const bg = (p.pTime || [0])[0] || 0;
            const text = (p.words || []).map((w: any) => w.text || '').join('');
            return { time: formatTime(bg), timeMs: bg, role: p.role, roleName: rMap[p.role] || `说话人${p.role}`, text };
          });
          if (!Object.keys(rMap).length) {
            const roles = new Set<string>(); parsed.forEach((p: any) => roles.add(p.roleName));
            let i = 1; roles.forEach(r => { rMap[String(i)] = r; i++; });
          }
          setRoleMap(rMap); setParagraphs(parsed);
        } catch { setParagraphs([]); }
      }
      setLoading(false);
      if (data.audio_enhanced_demucs_path) { setHasDemucs(true); setAudioSource('enhanced_demucs'); }
      setDemucsPassesCount(data.demucs_passes || 0);
      if (data.transcript_demucs_json) {
        try {
          const rawDemucs = JSON.parse(data.transcript_demucs_json);
          const parsedDemucs = rawDemucs.map((p: TranscriptParagraph) => {
            const bg = (p.pTime || [0])[0] || 0;
            const text = (p.words || []).map((w: any) => w.text || '').join('');
            return { time: formatTime(bg), timeMs: bg, role: p.role, roleName: 'Whisper', text };
          });
          setDemucsParagraphs(parsedDemucs);
        } catch {}
      }
    }).catch(() => setLoading(false));
  }, [params.id]);

  // Suppress WaveSurfer AbortError (thrown async during destroy)
  useEffect(() => {
    const handler = (e: PromiseRejectionEvent) => {
      if (e.reason?.name === 'AbortError') e.preventDefault();
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  // Load topics
  useEffect(() => {
    fetch('/api/topics').then(r => r.json()).then((data: any[]) => {
      setTopics(data.map(t => toTopicOption(t)));
    });
  }, []);

  // Current audio path based on source
  const currentAudioPath = speech
    ? (audioSource === 'enhanced_demucs' && speech.audio_enhanced_demucs_path ? speech.audio_enhanced_demucs_path
      : speech.audio_path)
    : '';

  // ── Init WaveSurfer ──
  useEffect(() => {
    if (!currentAudioPath || !waveformRef.current) return;

    // Destroy previous instance
    if (wsRef.current) {
      try { wsRef.current.destroy(); } catch {}
      wsRef.current = null;
      wsReadyRef.current = false;
      setWsReady(false);
    }
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch {} }

    // Create audio element + GainNode for volume control (0-400%)
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(audio);
    const gain = ctx.createGain();
    gain.gain.value = volume / 100;
    source.connect(gain);
    gain.connect(ctx.destination);
    audioCtxRef.current = ctx;
    gainRef.current = gain;

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      media: audio,
      waveColor: '#4a5568',
      progressColor: '#3b82f6',
      cursorColor: '#60a5fa',
      cursorWidth: 2,
      barWidth: 2, barGap: 1, barRadius: 2,
      height: 100, normalize: true,
    });
    ws.load(fileUrl(currentAudioPath));

    ws.on('ready', () => {
      wsRef.current = ws;
      // Resume AudioContext on first user interaction (autoplay policy)
      if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
      setWsReady(true);
    });
    ws.on('audioprocess', () => {
      const ct = ws.getCurrentTime();
      setCurrentTime(ct);
      syncSlide(ct);
    });
    ws.on('seeking', () => setCurrentTime(ws.getCurrentTime()));
    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));

    return () => {
      audio.pause();
      audio.src = '';
      try { ws.destroy(); } catch {}
      if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch {} }
      audioCtxRef.current = null;
      gainRef.current = null;
      wsRef.current = null; setWsReady(false);
    };
  }, [currentAudioPath]);

  // Sync volume via GainNode when slider changes
  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume / 100;
  }, [volume]);

  // ── Init overview WaveSurfer (on expand) ──
  useEffect(() => {
    if (!waveExpanded || !currentAudioPath || !overviewRef.current) return;
    if (overviewWsRef.current) { try { overviewWsRef.current.destroy(); } catch {} overviewWsRef.current = null; }

    const ows = WaveSurfer.create({
      container: overviewRef.current,
      waveColor: '#374151', progressColor: '#3b82f680',
      height: 40, barWidth: 1, barGap: 0, normalize: true, interact: false,
    });
    ows.load(fileUrl(currentAudioPath));
    ows.on('ready', () => { overviewWsRef.current = ows; });

    return () => {
      try { ows.destroy(); } catch {}
      overviewWsRef.current = null;
    };
  }, [waveExpanded, currentAudioPath]);

  // ── Slide sync ──
  const syncSlide = (ct: number) => {
    if (manualSlideRef.current || !speech?.slides?.length) return;
    const ms = ct * 1000;
    let best = 0;
    for (let i = speech.slides.length - 1; i >= 0; i--) {
      if (speech.slides[i].slide_time <= ms) { best = i; break; }
    }
    setCurrentSlide(best);
  };

  const togglePlay = () => wsRef.current?.playPause();
  const skipSec = (s: number) => {
    if (!wsRef.current) return;
    wsRef.current.setTime(Math.max(0, wsRef.current.getCurrentTime() + s));
  };
  const jumpToTime = (ms: number) => {
    if (!wsRef.current) return;
    wsRef.current.setTime(ms / 1000); wsRef.current.play();
  };
  const jumpToSlide = (idx: number) => {
    setCurrentSlide(idx);
    const slide = speech?.slides[idx];
    if (slide?.slide_time && wsRef.current) wsRef.current.setTime(slide.slide_time / 1000);
    manualSlideRef.current = true;
    setTimeout(() => { manualSlideRef.current = false; }, 3000);
  };

  // ── Minimap range → zoom ──
  const handleRangeChange = useCallback((start: number, end: number, finished: boolean) => {
    setRangeStart(start);
    setRangeEnd(end);
    if (!finished) return;
    const ws = wsRef.current;
    if (!ws) return;
    const dur = ws.getDuration();
    if (!dur) return;
    const span = end - start;
    if (span >= 0.99) { ws.zoom(1); return; }
    const cw = waveformRef.current?.clientWidth || 800;
    ws.zoom(cw / (span * dur));
    ws.seekTo(start);
  }, []);

  // ── Edit handlers ──
  const handleFieldChange = (field: string, value: any) => {
    setSpeech(prev => prev ? { ...prev, [field]: value } : prev);
  };

  const handleSave = async () => {
    if (!speech) return;
    const tags = tagsInput.split(/[,，]/).map(t => t.trim()).filter(Boolean);
    await fetch(`/api/speeches/${speech.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...speech, transcript, notes, tags }),
    });
    setEditing(false);
    // Re-fetch to get updated topic_name etc
    fetch(`/api/speeches/${params.id}`).then(r => r.json()).then(data => setSpeech(data));
  };

  const handleDelete = async () => {
    if (!confirm('确定要删除这条演讲记录吗？')) return;
    await fetch(`/api/speeches/${speech!.id}`, { method: 'DELETE' });
    router.push('/speeches');
  };

  const handleEnhance = async () => {
    if (!speech || enhancing) return;
    const abort = new AbortController();
    enhanceAbortRef.current = abort;
    setEnhancing(true);
    setEnhanceProgress(0);
    setEnhanceMessage(`启动人声分离（${demucsPasses}遍）...`);
    setEnhanceRemaining(0);

    try {
      const res = await fetch(`/api/speeches/${speech.id}/enhance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'demucs', passes: demucsPasses }),
        signal: abort.signal,
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || '处理失败');
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            const data = JSON.parse(line.slice(6));
            if (currentEvent === 'progress') {
              setEnhanceProgress(data.pct);
              setEnhanceMessage(data.message);
              setEnhanceRemaining(data.remaining);
            } else if (currentEvent === 'done') {
              setSpeech(prev => prev ? { ...prev, [data.dbColumn]: data.enhancedPath } : prev);
              setHasDemucs(true);
              setAudioSource('enhanced_demucs');
              if (data.passes) setDemucsPassesCount(data.passes);
            } else if (currentEvent === 'error') {
              alert(data.error);
            }
            currentEvent = '';
          }
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') alert('处理失败');
    } finally {
      enhanceAbortRef.current = null;
      setEnhancing(false);
      setEnhanceProgress(0);
    }
  };

  const handleEnhanceStop = () => {
    enhanceAbortRef.current?.abort();
    enhanceAbortRef.current = null;
    setEnhancing(false);
    setEnhanceProgress(0);
    setEnhanceMessage('');
  };

  const handleTranscribe = async () => {
    if (!speech || transcribing) return;
    setShowTranscribeOptions(false);
    setTranscribing(true);
    setTranscribeProgress(0);
    setTranscribeMessage('启动 Whisper 转写...');

    try {
      const res = await fetch(`/api/speeches/${speech.id}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioSource: whisperSource, model: whisperModel }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || '转写失败');
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            const data = JSON.parse(line.slice(6));
            if (currentEvent === 'progress') {
              setTranscribeProgress(data.pct);
              setTranscribeMessage(data.message);
            } else if (currentEvent === 'done') {
              // Reload speech to get transcript_demucs_json
              fetch(`/api/speeches/${params.id}`).then(r => r.json()).then(d => {
                if (d.transcript_demucs_json) {
                  try {
                    const rawDemucs = JSON.parse(d.transcript_demucs_json);
                    const parsedDemucs = rawDemucs.map((p: TranscriptParagraph) => {
                      const bg = (p.pTime || [0])[0] || 0;
                      const text = (p.words || []).map((w: any) => w.text || '').join('');
                      return { time: formatTime(bg), timeMs: bg, role: p.role, roleName: 'Whisper', text };
                    });
                    setDemucsParagraphs(parsedDemucs);
                  } catch {}
                }
              });
            } else if (currentEvent === 'error') {
              alert(data.error);
            }
            currentEvent = '';
          }
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') alert('转写失败');
    } finally {
      setTranscribing(false);
      setTranscribeProgress(0);
    }
  };

  const handleCancelEdit = () => {
    // Reset to original data
    fetch(`/api/speeches/${params.id}`).then(r => r.json()).then(data => {
      setSpeech(data);
      setTranscript(data.transcript || '');
      setNotes(data.notes || '');
      setTagsInput(data.tags || '');
    });
    setEditing(false);
  };

  const progress = speech?.audio_duration ? Math.min(100, (currentTime * 1000) / speech.audio_duration * 100) : 0;
  const fmtDur = (ms: number) => {
    if (!ms) return '00:00';
    const t = Math.floor(ms / 1000);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (loading) return <div className="text-center py-16 text-gray-500">Loading...</div>;
  if (!speech) return <div className="text-center py-16 text-gray-500">未找到</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => router.push('/speeches')} className="text-xs text-gray-500 hover:text-gray-300 mb-2 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            返回列表
          </button>
          <h1 className="text-xl font-bold text-white">{speech.title}</h1>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
            {speech.speaker && <span>{speech.speaker}</span>}
            {speech.conference && <span>{speech.conference}</span>}
            {speech.speech_date && <span>{new Date(speech.speech_date).toLocaleDateString('zh-CN')}</span>}
            {speech.audio_duration > 0 && <span>{fmtDur(speech.audio_duration)}</span>}
          </div>
          {(speech.topic_name || speech.source_url || speech.tags) && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {speech.topic_name && <span className="text-[10px] px-2 py-0.5 bg-emerald-900/20 text-emerald-400/80 rounded">{speech.topic_name}</span>}
              {speech.tags && speech.tags.split(',').map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 bg-blue-900/20 text-blue-400/70 rounded">{t}</span>)}
              {speech.source_url && <a href={speech.source_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400/60 hover:text-blue-400 ml-1">原文链接</a>}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button onClick={handleCancelEdit} className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">取消</button>
              <button onClick={handleSave} className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">保存</button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">编辑</button>
              <button onClick={handleDelete} className="px-3 py-1.5 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg transition-colors">删除</button>
            </>
          )}
        </div>
      </div>

      {/* Edit mode: full form like import page */}
      {editing ? (
        <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-white mb-4">编辑演讲信息</h2>
          <EditForm
            speech={speech}
            transcript={transcript}
            notes={notes}
            tagsInput={tagsInput}
            topics={topics}
            onTranscriptChange={setTranscript}
            onNotesChange={setNotes}
            onTagsChange={setTagsInput}
            onFieldChange={handleFieldChange}
          />
          <div className="flex gap-3 mt-6 pt-4 border-t border-gray-800/40">
            <button onClick={handleSave} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
              保存修改
            </button>
            <button onClick={handleCancelEdit} className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">
              取消
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Audio + Slides */}
          {(speech.slides?.length > 0 || speech.audio_path) && (
            <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-5 space-y-4">
              {speech.audio_path && (
                <div className="space-y-3">
                  {/* Audio source toggle + enhance buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Source tabs */}
                    <div className="flex bg-gray-800/60 rounded-lg overflow-hidden">
                      <button onClick={() => setAudioSource('original')}
                        className={`px-2.5 py-1 text-[10px] transition-colors ${audioSource === 'original' ? 'bg-blue-600/30 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
                      >原始</button>
                      {hasDemucs && (
                        <button onClick={() => setAudioSource('enhanced_demucs')}
                          className={`px-2.5 py-1 text-[10px] transition-colors ${audioSource === 'enhanced_demucs' ? 'bg-purple-600/30 text-purple-400' : 'text-gray-500 hover:text-gray-300'}`}
                        >人声分离</button>
                      )}
                    </div>
                    {/* Enhance action */}
                    {enhancing ? (
                      <button onClick={handleEnhanceStop}
                        className="px-3 py-1 text-[10px] bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/20 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
                        停止
                      </button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button onClick={handleEnhance}
                          className={`px-3 py-1 text-[10px] rounded-lg transition-colors flex items-center gap-1.5 ${hasDemucs ? 'bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/20' : 'bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/20'}`}
                        >{hasDemucs ? '重新处理' : '人声分离'}</button>
                        <select value={demucsPasses} onChange={e => setDemucsPasses(Number(e.target.value))}
                          className="px-1.5 py-1 text-[10px] bg-gray-800/60 text-gray-400 border border-gray-700/40 rounded-lg cursor-pointer">
                          {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}遍</option>)}
                        </select>
                      </div>
                    )}
                    {/* Progress bar */}
                    {enhancing && (
                      <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${enhanceProgress}%` }} />
                        </div>
                        <span className="text-[10px] text-gray-500 w-20 text-right">
                          {enhanceProgress > 0 && enhanceRemaining > 0 ? `约 ${enhanceRemaining}s` : `${enhanceProgress}%`}
                        </span>
                      </div>
                    )}
                    {enhancing && enhanceMessage && !enhanceProgress && (
                      <span className="text-[10px] text-gray-500 flex items-center gap-1.5">
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        {enhanceMessage}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => skipSec(-10)} className="text-[11px] text-gray-500 hover:text-gray-300 px-2 py-1 bg-gray-800/40 rounded">-10s</button>
                    <button onClick={togglePlay} disabled={!wsReady}
                      className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-30 text-white transition-colors">
                      {isPlaying ? (
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
                      ) : (
                        <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      )}
                    </button>
                    <button onClick={() => skipSec(10)} className="text-[11px] text-gray-500 hover:text-gray-300 px-2 py-1 bg-gray-800/40 rounded">+10s</button>
                    <span className="text-xs text-gray-500 font-mono">{fmtDur(Math.round(currentTime * 1000))} / {fmtDur(speech.audio_duration)}</span>
                    <div className="flex items-center gap-1.5 ml-2">
                      <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M6.5 8.8l4.7-3.5v13.4l-4.7-3.5H3.5a1 1 0 01-1-1v-4.4a1 1 0 011-1h3z" /></svg>
                      <input type="range" min={10} max={2000} value={volume}
                        onChange={e => setVolume(Number(e.target.value))}
                        className="w-20 h-1 accent-blue-500 cursor-pointer" />
                      <span className="text-[10px] text-gray-500 w-8">{volume}%</span>
                    </div>
                    <div className="flex-1" />
                    <button onClick={() => setWaveExpanded(!waveExpanded)}
                      className="text-[11px] text-gray-500 hover:text-gray-300 px-2 py-1 bg-gray-800/40 rounded flex items-center gap-1">
                      {waveExpanded ? (
                        <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg> 收起波形</>
                      ) : (
                        <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg> 展开波形</>
                      )}
                    </button>
                  </div>

                  <div className="relative h-2 bg-gray-800 rounded-full cursor-pointer group"
                    onClick={(e) => {
                      if (!wsRef.current) return;
                      const r = (e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.getBoundingClientRect().width;
                      wsRef.current.seekTo(r);
                    }}>
                    <div className="h-full bg-blue-600/80 rounded-full" style={{ width: `${progress}%`, transition: 'width 0.1s linear' }} />
                    <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ left: `calc(${progress}% - 6px)` }} />
                  </div>

                  <div className="overflow-hidden transition-[max-height] duration-300" style={{ maxHeight: waveExpanded ? '500px' : '0' }}>
                    <div className="space-y-2 pt-2 border-t border-gray-800/40">
                      <div ref={waveformRef} className="rounded-lg overflow-hidden bg-gray-900/20 min-h-[100px]" />
                      <div ref={overviewWrapRef} className="relative rounded-lg overflow-hidden border border-gray-700/30">
                        <div className="relative">
                          <div ref={overviewRef} />
                          <MinimapSlider containerRef={overviewWrapRef} rangeStart={rangeStart} rangeEnd={rangeEnd} onRangeChange={handleRangeChange} />
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-600">拖动左右边缘缩放波形 · 拖动中间区域平移 · 点击波形跳转播放位置</p>
                    </div>
                  </div>
                  {!wsReady && <div className="text-xs text-gray-600 text-center py-2">音频加载中...</div>}
                </div>
              )}

              {speech.slides?.length > 0 && (
                <div className="relative">
                  <img src={fileUrl(speech.slides[currentSlide].image_path)} alt=""
                    className="max-h-[500px] mx-auto rounded-lg border border-gray-800/50 cursor-pointer"
                    onClick={() => jumpToTime(speech.slides[currentSlide]?.slide_time || 0)} />
                  <div className="flex items-center justify-center gap-4 mt-3">
                    <button onClick={() => jumpToSlide(Math.max(0, currentSlide - 1))} disabled={currentSlide === 0}
                      className="px-3 py-1 text-xs bg-gray-800/50 text-gray-400 rounded disabled:opacity-30">上一张</button>
                    <span className="text-xs text-gray-500">{currentSlide + 1} / {speech.slides.length}</span>
                    {speech.slides[currentSlide]?.slide_time > 0 && <span className="text-[10px] text-gray-600">{fmtDur(speech.slides[currentSlide].slide_time)}</span>}
                    <button onClick={() => jumpToSlide(Math.min(speech.slides.length - 1, currentSlide + 1))} disabled={currentSlide === speech.slides.length - 1}
                      className="px-3 py-1 text-xs bg-gray-800/50 text-gray-400 rounded disabled:opacity-30">下一张</button>
                  </div>
                </div>
              )}

              {speech.slides?.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {speech.slides.map((slide, idx) => (
                    <div key={slide.id} onClick={() => jumpToSlide(idx)}
                      className={`relative shrink-0 cursor-pointer rounded border-2 transition-colors ${idx === currentSlide ? 'border-blue-500' : 'border-transparent hover:border-gray-600'}`}>
                      <img src={fileUrl(slide.image_path)} alt="" className="h-16 w-auto rounded" />
                      {slide.slide_time > 0 && <span className="absolute bottom-0.5 right-0.5 text-[8px] bg-black/70 text-gray-300 px-1 rounded">{fmtDur(slide.slide_time)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Structured Transcript */}
          {paragraphs.length > 0 ? (
            <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-white">
                  {demucsParagraphs.length > 0 ? '字幕对比' : `字幕 (${paragraphs.length} 段)`}
                </h2>
                <div className="flex items-center gap-2">
                  {Object.entries(roleMap).map(([r, n]) => <span key={r} className="text-[10px] px-2 py-0.5 bg-purple-900/20 text-purple-400/70 rounded">{n}</span>)}
                  {/* Whisper transcribe button */}
                  {transcribing ? (
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${transcribeProgress}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-500">{transcribeProgress}%</span>
                      {transcribeMessage && <span className="text-[10px] text-gray-500">{transcribeMessage}</span>}
                    </div>
                  ) : (
                    <div className="relative">
                      <button onClick={() => setShowTranscribeOptions(!showTranscribeOptions)}
                        className={`px-3 py-1 text-[10px] rounded-lg transition-colors flex items-center gap-1.5 ${demucsParagraphs.length > 0 ? 'bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/20' : 'bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 border border-cyan-500/20'}`}
                      >
                        {demucsParagraphs.length > 0 ? '重新识别' : 'Whisper 识别'}
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                      {showTranscribeOptions && (
                        <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700/50 rounded-lg p-3 z-50 w-56 shadow-xl">
                          <div className="mb-2">
                            <label className="text-[10px] text-gray-400 block mb-1">音频源</label>
                            <select value={whisperSource} onChange={e => setWhisperSource(e.target.value as any)}
                              className="w-full bg-gray-900/60 border border-gray-700/40 rounded px-2 py-1 text-[11px] text-gray-300">
                              <option value="original">原始音频</option>
                              {hasDemucs && <option value="demucs">人声分离音频</option>}
                            </select>
                          </div>
                          <div className="mb-2">
                            <label className="text-[10px] text-gray-400 block mb-1">模型大小</label>
                            <select value={whisperModel} onChange={e => setWhisperModel(e.target.value)}
                              className="w-full bg-gray-900/60 border border-gray-700/40 rounded px-2 py-1 text-[11px] text-gray-300">
                              <option value="tiny">tiny（最快）</option>
                              <option value="base">base（快）</option>
                              <option value="small">small（均衡）</option>
                              <option value="medium">medium（推荐）</option>
                              <option value="large-v3">large-v3（最准）</option>
                            </select>
                          </div>
                          <button onClick={handleTranscribe}
                            className="w-full py-1.5 text-[11px] bg-cyan-600 hover:bg-cyan-700 text-white rounded transition-colors">
                            开始识别
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {demucsParagraphs.length > 0 ? (
                /* Dual-pane layout with shared scroll */
                <div className="flex gap-0 max-h-[500px] overflow-y-auto" id="dual-pane-scroll">
                  {/* Left: Original subtitles */}
                  <div className="flex-1 min-w-0 border-r border-gray-800/40 pr-3">
                    <div className="text-[10px] text-gray-500 mb-2 font-medium sticky top-0 bg-[#0a0a0a]/90 backdrop-blur py-1 z-10">原始字幕</div>
                    <div className="space-y-1.5">
                      {paragraphs.map((p, i) => (
                        <div key={i} className="flex gap-2 text-xs py-1 px-2 rounded hover:bg-gray-800/30 cursor-pointer group" onClick={() => jumpToTime(p.timeMs)}>
                          <span className="shrink-0 text-gray-600 font-mono w-12 text-right">[{p.time}]</span>
                          <span className="shrink-0 text-purple-400/70 w-16">{p.roleName}</span>
                          <span className="text-gray-300 group-hover:text-gray-100">{p.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Right: Whisper transcript */}
                  <div className="flex-1 min-w-0 pl-3">
                    <div className="text-[10px] text-cyan-400/70 mb-2 font-medium sticky top-0 bg-[#0a0a0a]/90 backdrop-blur py-1 z-10">Whisper 识别</div>
                    <div className="space-y-1.5">
                      {demucsParagraphs.map((p, i) => (
                        <div key={i} className="flex gap-2 text-xs py-1 px-2 rounded hover:bg-gray-800/30 cursor-pointer group" onClick={() => jumpToTime(p.timeMs)}>
                          <span className="shrink-0 text-gray-600 font-mono w-12 text-right">[{p.time}]</span>
                          <span className="text-cyan-400/70 group-hover:text-cyan-300">{p.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* Single column: original only */
                <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-2">
                  {paragraphs.map((p, i) => (
                    <div key={i} className="flex gap-2 text-xs py-1 px-2 rounded hover:bg-gray-800/30 cursor-pointer group" onClick={() => jumpToTime(p.timeMs)}>
                      <span className="shrink-0 text-gray-600 font-mono w-12 text-right">[{p.time}]</span>
                      <span className="shrink-0 text-purple-400/70 w-16">{p.roleName}</span>
                      <span className="text-gray-300 group-hover:text-gray-100">{p.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-3">字幕/转写文本</h2>
              <div className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed">{speech.transcript || '暂无转写文本'}</div>
            </div>
          )}

          {/* Notes */}
          <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3">个人笔记</h2>
            <div className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed">{speech.notes || '暂无笔记'}</div>
          </div>
        </>
      )}
    </div>
  );
}

function formatTime(ms: number): string {
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
