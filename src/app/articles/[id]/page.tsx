'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';

interface Article {
  id: number;
  title: string;
  source_name: string;
  source_url: string;
  author: string;
  summary: string;
  content: string;
  content_html: string;
  cover_image: string;
  published_at: string;
  topic_name: string;
  tags?: string;
  ai_keywords?: string;
  ai_summary?: string;
  ai_entities?: string;
  ai_analyzed_at?: string;
}

// Convert HTML to clean text with paragraph breaks for editing
function htmlToEditableText(html: string): string {
  let text = html;
  // Preserve images as placeholders before stripping tags
  text = text.replace(/<img\b[^>]*?src=["']([^"']+)["'][^>]*?>/gi, '\n\n[img:$1]\n\n');
  // Block elements → double newline
  text = text.replace(/<\/(?:p|div|h[1-6]|li|blockquote|tr)>/gi, '\n\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode entities
  text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  // Collapse 3+ newlines into 2
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

// Convert edited text back to HTML
function textToHtml(text: string): string {
  const paragraphs = text.split(/\n\n+/).filter(Boolean);
  return paragraphs.map(p => {
    // Restore image placeholders to <img> tags
    if (/^\[img:.+\]$/.test(p.trim())) {
      const src = p.trim().match(/^\[img:(.+)\]$/)?.[1] || '';
      return `<img src="${src}" alt="" style="max-width:100%">`;
    }
    const restored = p.replace(/\[img:([^\]]+)\]/g, '<img src="$1" alt="" style="max-width:100%">');
    return `<p>${restored.replace(/\n/g, '<br>')}</p>`;
  }).join('');
}

function getPlainText(article: Article): string {
  if (article.content) return article.title + '\n\n' + article.content;
  if (article.content_html) {
    return article.title + '\n\n' + htmlToEditableText(article.content_html);
  }
  return article.title;
}

// Split text into chunks at natural sentence boundaries (。！？)
function splitToChunks(text: string, maxLen: number): string[] {
  const sentences = text.match(/[^。！？；!?\n]+[。！？；!?]*/g);
  if (!sentences || sentences.length === 0) return [text];
  const chunks: string[] = [];
  let current = '';
  for (const s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    if (current.length + trimmed.length > maxLen && current) {
      chunks.push(current.trim());
      current = trimmed;
    } else {
      current += trimmed;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text];
}

type VoiceGender = 'auto' | 'male' | 'female';

export default function ArticleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: '', summary: '', content: '', tags: '' });
  const [analyzing, setAnalyzing] = useState(false);

  // Reading mode state
  const [reading, setReading] = useState(false);
  const [readProgress, setReadProgress] = useState(0);
  const [fontSize, setFontSize] = useState(16);
  const contentRef = useRef<HTMLDivElement>(null);

  // TTS state
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [voiceGender, setVoiceGender] = useState<VoiceGender>('auto');
  const [voiceOpen, setVoiceOpen] = useState(false);
  const voiceRef = useRef<HTMLDivElement>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [currentParaIdx, setCurrentParaIdx] = useState(-1);
  const readingContentElRef = useRef<HTMLDivElement>(null);
  const normalContentElRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/articles/${params.id}`).then(r => r.json()).then(data => {
      setArticle(data);
      // Generate editable text: prefer HTML→text conversion for proper paragraph breaks
      const editableText = data.content_html
        ? htmlToEditableText(data.content_html)
        : (data.content || '');
      setForm({
        title: data.title || '',
        summary: data.summary || '',
        content: editableText,
        tags: data.tags || '',
      });
      // Auto-enter edit mode if ?edit=1
      if (searchParams.get('edit') === '1') setEditing(true);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [params.id]);

  // Close voice dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (voiceRef.current && !voiceRef.current.contains(e.target as Node)) setVoiceOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Cleanup speech on unmount
  useEffect(() => {
    return () => { window.speechSynthesis?.cancel(); };
  }, []);

  // Reading progress tracker
  useEffect(() => {
    if (!reading) return;
    const handleScroll = () => {
      if (!contentRef.current) return;
      const el = contentRef.current;
      const scrollTop = el.scrollTop;
      const scrollHeight = el.scrollHeight - el.clientHeight;
      setReadProgress(scrollHeight > 0 ? Math.min(Math.round((scrollTop / scrollHeight) * 100), 100) : 0);
    };
    const el = contentRef.current;
    el?.addEventListener('scroll', handleScroll);
    return () => el?.removeEventListener('scroll', handleScroll);
  }, [reading]);

  const getVoice = useCallback((gender: VoiceGender): SpeechSynthesisVoice | null => {
    const voices = window.speechSynthesis.getVoices();
    const zhVoices = voices.filter(v => v.lang.startsWith('zh'));
    if (zhVoices.length === 0) return voices[0] || null;
    if (gender === 'male') {
      const male = zhVoices.find(v => /male|nan|jun|kang|ying/i.test(v.name) && !/female|nv|nü/i.test(v.name));
      return male || zhVoices[0];
    }
    if (gender === 'female') {
      const female = zhVoices.find(v => /female|nv|nü|ting|xiao|mei/i.test(v.name));
      return female || zhVoices[0];
    }
    return zhVoices[0];
  }, []);

  // Core TTS: speak an array of items, highlighting the current paragraph
  const speakItems = useCallback((items: { text: string; element?: HTMLElement }[]) => {
    const synth = window.speechSynthesis;
    synth.cancel();

    // Clear previous highlights
    const allEls = items.flatMap(item => item.element ? [item.element] : []);
    allEls.forEach(el => { el.style.backgroundColor = ''; el.style.borderRadius = ''; el.style.transition = ''; });

    // Build chunks at sentence boundaries (≤500 chars), tracking which item each chunk belongs to
    const chunks: { text: string; itemIdx: number }[] = [];
    for (let i = 0; i < items.length; i++) {
      const t = items[i].text;
      if (t.length <= 500) {
        chunks.push({ text: t, itemIdx: i });
      } else {
        for (const sc of splitToChunks(t, 500)) {
          chunks.push({ text: sc, itemIdx: i });
        }
      }
    }

    let chunkIdx = 0;
    let lastIdx = -1;
    const speakNext = () => {
      if (chunkIdx >= chunks.length) {
        setSpeaking(false); setPaused(false); setCurrentParaIdx(-1);
        allEls.forEach(el => { el.style.backgroundColor = ''; el.style.borderRadius = ''; el.style.transition = ''; });
        return;
      }
      const { text, itemIdx } = chunks[chunkIdx];
      if (itemIdx !== lastIdx) {
        allEls.forEach(el => { el.style.backgroundColor = ''; el.style.borderRadius = ''; });
        const el = items[itemIdx].element;
        if (el) {
          el.style.transition = 'background-color 0.3s';
          el.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
          el.style.borderRadius = '4px';
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        setCurrentParaIdx(itemIdx);
        lastIdx = itemIdx;
      }
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'zh-CN'; utt.rate = 1;
      const voice = getVoice(voiceGender);
      if (voice) utt.voice = voice;
      utt.onend = () => { chunkIdx++; speakNext(); };
      utt.onerror = () => {
        setSpeaking(false); setPaused(false); setCurrentParaIdx(-1);
        allEls.forEach(el => { el.style.backgroundColor = ''; el.style.borderRadius = ''; el.style.transition = ''; });
      };
      utteranceRef.current = utt;
      synth.speak(utt);
    };

    setSpeaking(true); setPaused(false);
    if (synth.getVoices().length === 0) {
      synth.addEventListener('voiceschanged', () => speakNext(), { once: true });
    } else { speakNext(); }
  }, [voiceGender, getVoice]);

  const handleSpeak = useCallback(() => {
    if (!article) return;
    const synth = window.speechSynthesis;
    if (speaking && !paused) { synth.pause(); setPaused(true); return; }
    if (paused) { synth.resume(); setPaused(false); return; }

    // Start from beginning: title + all content paragraphs
    const container = readingContentElRef.current || normalContentElRef.current;
    const blockEls = container
      ? (Array.from(container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote')) as HTMLElement[])
      : [];

    const items: { text: string; element?: HTMLElement }[] = [{ text: article.title }];
    blockEls.forEach(el => {
      const t = el.textContent?.trim();
      if (t) items.push({ text: t, element: el });
    });

    speakItems(items);
  }, [article, speaking, paused, speakItems]);

  const handleStopSpeak = useCallback(() => {
    window.speechSynthesis.cancel();
    setSpeaking(false); setPaused(false); setCurrentParaIdx(-1);
    const container = readingContentElRef.current || normalContentElRef.current;
    if (container) {
      container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote').forEach(el => {
        (el as HTMLElement).style.backgroundColor = '';
        (el as HTMLElement).style.borderRadius = '';
        (el as HTMLElement).style.transition = '';
      });
    }
  }, []);

  // Click a paragraph to start reading from there
  const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (editing || !article) return;
    const target = e.target as HTMLElement;
    const block = target.closest('p, h1, h2, h3, h4, h5, h6, li, blockquote') as HTMLElement | null;
    if (!block) return;

    const container = e.currentTarget;
    const allBlocks = Array.from(container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote')) as HTMLElement[];
    const clickedIdx = allBlocks.indexOf(block);
    if (clickedIdx < 0) return;

    const items: { text: string; element: HTMLElement }[] = [];
    for (let i = clickedIdx; i < allBlocks.length; i++) {
      const t = allBlocks[i].textContent?.trim();
      if (t) items.push({ text: t, element: allBlocks[i] });
    }
    if (items.length === 0) return;
    speakItems(items);
  }, [editing, article, speakItems]);

  const handleSave = async () => {
    const newContentHtml = textToHtml(form.content);
    await fetch(`/api/articles/${article!.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...article,
        title: form.title,
        summary: form.summary,
        content: form.content,
        content_html: newContentHtml,
        tags: form.tags.split(/[,，]/).map(t => t.trim()).filter(Boolean),
      }),
    });
    setEditing(false);
    fetch(`/api/articles/${params.id}`).then(r => r.json()).then(data => {
      setArticle(data);
      const editableText = data.content_html ? htmlToEditableText(data.content_html) : (data.content || '');
      setForm({ title: data.title || '', summary: data.summary || '', content: editableText, tags: data.tags || '' });
    });
  };

  const handleDelete = async () => {
    if (!confirm('确定要删除这篇文章吗？')) return;
    await fetch(`/api/articles/${article!.id}`, { method: 'DELETE' });
    router.push('/articles');
  };

  const handleAnalyze = async () => {
    if (!article || analyzing) return;
    setAnalyzing(true);
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: 'article', contentId: article.id }),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      setArticle(prev => prev ? {
        ...prev,
        ai_keywords: JSON.stringify(data.keywords),
        ai_summary: data.summary,
        ai_entities: JSON.stringify(data.entities),
        ai_analyzed_at: new Date().toISOString(),
      } : prev);
    } catch (err) {
      console.error('AI analyze failed:', err);
      alert('AI 分析失败');
    } finally {
      setAnalyzing(false);
    }
  };

  const enterReading = useCallback(() => {
    setReading(true); setEditing(false); setReadProgress(0);
  }, []);

  const exitReading = useCallback(() => {
    setReading(false); handleStopSpeak();
  }, [handleStopSpeak]);

  if (loading) return <div className="text-center py-16 text-gray-500">Loading...</div>;
  if (!article) return <div className="text-center py-16 text-gray-500">未找到</div>;

  // TTS control bar
  const ttsControls = (
    <div className="flex items-center gap-2">
      <div ref={voiceRef} className="relative">
        <button onClick={() => setVoiceOpen(!voiceOpen)}
          className="flex items-center gap-1 px-2 py-1 text-[10px] bg-gray-800/60 hover:bg-gray-700 rounded-md text-gray-400 transition-colors">
          {voiceGender === 'male' ? '男声' : voiceGender === 'female' ? '女声' : '默认'}
          <svg className="w-2.5 h-2.5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </button>
        {voiceOpen && (
          <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700/50 rounded-lg shadow-xl py-1 z-50 min-w-[80px]">
            {([['auto', '默认'], ['male', '男声'], ['female', '女声']] as const).map(([val, label]) => (
              <button key={val} onClick={() => { setVoiceGender(val); setVoiceOpen(false); if (speaking) handleStopSpeak(); }}
                className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-gray-700/60 transition-colors ${voiceGender === val ? 'text-emerald-400' : 'text-gray-300'}`}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button onClick={handleSpeak}
        className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${speaking ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-gray-800/60 hover:bg-gray-700 text-gray-400'}`}
        title={speaking ? (paused ? '继续朗读' : '暂停') : '朗读文章'}>
        {speaking && !paused ? (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
        )}
      </button>
      {speaking && (
        <button onClick={handleStopSpeak} className="w-8 h-8 flex items-center justify-center bg-gray-800/60 hover:bg-gray-700 rounded-full text-gray-400 transition-colors" title="停止朗读">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
        </button>
      )}
    </div>
  );

  // ---- Reading Mode ----
  if (reading) {
    return (
      <div className="fixed inset-0 z-[100] bg-[#1a1a1a] flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800/40 bg-[#1a1a1a] shrink-0">
          <button onClick={exitReading} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            退出阅读
          </button>
          <div className="flex items-center gap-3">
            {ttsControls}
            <div className="w-px h-4 bg-gray-700/50" />
            <div className="flex items-center gap-1.5">
              <button onClick={() => setFontSize(s => Math.max(14, s - 1))} className="w-7 h-7 flex items-center justify-center bg-gray-800/60 hover:bg-gray-700 rounded-md text-gray-400 text-xs">A-</button>
              <span className="text-[10px] text-gray-500 w-6 text-center">{fontSize}</span>
              <button onClick={() => setFontSize(s => Math.min(22, s + 1))} className="w-7 h-7 flex items-center justify-center bg-gray-800/60 hover:bg-gray-700 rounded-md text-gray-400 text-xs">A+</button>
            </div>
            {readProgress > 0 && <span className="text-[10px] text-gray-500">{readProgress}%</span>}
          </div>
        </div>
        {speaking && (
          <div className="flex items-center gap-2 px-6 py-1.5 bg-emerald-900/10 border-b border-emerald-500/10 shrink-0">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-[10px] text-emerald-400/60">{paused ? '已暂停' : '朗读中...'}</span>
            <span className="text-[10px] text-gray-600 ml-auto">点击段落可跳转</span>
          </div>
        )}
        <div className="h-0.5 bg-gray-800/40 shrink-0">
          <div className="h-full bg-emerald-500/60 transition-all duration-300" style={{ width: `${readProgress}%` }} />
        </div>
        <div ref={contentRef} className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-8 py-10">
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-white leading-snug mb-4" style={{ fontSize: fontSize + 6 }}>{article.title}</h1>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                {article.source_name && <span className="text-emerald-400/60">{article.source_name}</span>}
                {article.author && <span>{article.author}</span>}
                {article.published_at && <span>{new Date(article.published_at).toLocaleDateString('zh-CN')}</span>}
              </div>
            </div>
            {article.summary && (
              <div className="mb-8 pl-4 border-l-2 border-emerald-500/30">
                <p className="text-gray-400 italic" style={{ fontSize: fontSize - 2, lineHeight: 1.8 }}>{article.summary}</p>
              </div>
            )}
            {article.content_html ? (
              <div ref={readingContentElRef} onClick={handleContentClick} className="article-content prose prose-invert max-w-none [&_p]:leading-[2] [&_p]:mb-5 [&_p]:cursor-pointer [&_h1]:font-bold [&_h1]:text-white [&_h1]:mt-8 [&_h1]:mb-4 [&_h1]:cursor-pointer [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:cursor-pointer [&_h3]:font-bold [&_h3]:text-gray-200 [&_h3]:mt-5 [&_h3]:mb-3 [&_h3]:cursor-pointer [&_ul]:ml-5 [&_ul]:mb-4 [&_ul]:list-disc [&_ol]:ml-5 [&_ol]:mb-4 [&_ol]:list-decimal [&_li]:leading-7 [&_li]:mb-1.5 [&_li]:cursor-pointer [&_blockquote]:border-l-2 [&_blockquote]:border-emerald-500/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-400 [&_blockquote]:mb-5 [&_blockquote]:cursor-pointer [&_img]:rounded-lg [&_img]:max-w-full [&_img]:my-5 [&_strong]:text-gray-100 [&_strong]:font-semibold [&_a]:text-emerald-400 [&_a]:underline [&_table]:w-full [&_table]:mb-5 [&_td]:px-3 [&_td]:py-2 [&_td]:border [&_td]:border-gray-700/50 [&_th]:px-3 [&_th]:py-2 [&_th]:border [&_th]:border-gray-700/50 [&_th]:bg-gray-800/50" title="点击段落可从此处开始朗读" style={{ fontSize }} dangerouslySetInnerHTML={{ __html: article.content_html }} />
            ) : (
              <div className="text-gray-300 leading-[2] whitespace-pre-wrap" style={{ fontSize }}>{article.content || '暂无正文内容'}</div>
            )}
            <div className="mt-12 pt-6 border-t border-gray-800/40 flex items-center justify-between">
              {article.tags && (
                <div className="flex gap-2">
                  {article.tags.split(',').map(tag => (<span key={tag} className="text-[10px] px-2.5 py-1 bg-emerald-900/15 text-emerald-400/60 rounded-full">{tag}</span>))}
                </div>
              )}
              {article.source_url && (
                <a href={article.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-400/50 hover:text-emerald-400 transition-colors">阅读原文 →</a>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Normal Mode ----
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <button onClick={() => router.push('/articles')} className="text-xs text-gray-500 hover:text-gray-300 mb-2 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          返回列表
        </button>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            {editing ? (
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-lg font-bold text-gray-200 mb-2 focus:outline-none focus:border-emerald-500/50" />
            ) : (
              <h1 className="text-xl font-bold text-white">{article.title}</h1>
            )}
            <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
              {article.source_name && <span className="text-emerald-400/70">{article.source_name}</span>}
              {article.author && <span>{article.author}</span>}
              {article.published_at && <span>{new Date(article.published_at).toLocaleDateString('zh-CN')}</span>}
              {article.topic_name && <span className="px-2 py-0.5 bg-emerald-900/20 text-emerald-400/80 rounded">{article.topic_name}</span>}
            </div>
          </div>
          <div className="flex gap-2 ml-4">
            {editing ? (
              <>
                <button onClick={handleSave} className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors">保存</button>
                <button onClick={() => {
                  setEditing(false);
                  const editableText = article.content_html ? htmlToEditableText(article.content_html) : (article.content || '');
                  setForm({ title: article.title || '', summary: article.summary || '', content: editableText, tags: article.tags || '' });
                }} className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">取消</button>
              </>
            ) : (
              <>
                <button onClick={enterReading} className="px-3 py-1.5 text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg transition-colors flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                  阅读
                </button>
                {article.source_url && (
                  <a href={article.source_url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">原文链接</a>
                )}
                <button onClick={() => setEditing(true)} className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">编辑</button>
                <button onClick={handleAnalyze} disabled={analyzing}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-1 ${analyzing ? 'bg-cyan-900/30 text-cyan-400/50 cursor-wait' : 'bg-cyan-900/30 hover:bg-cyan-900/50 text-cyan-400'}`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  {analyzing ? '分析中...' : 'AI 分析'}
                </button>
                <button onClick={handleDelete} className="px-3 py-1.5 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg transition-colors">删除</button>
              </>
            )}
          </div>
        </div>
        {article.source_url && !editing && (
          <a href={article.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline mt-2 inline-block">查看原文 →</a>
        )}
        {article.tags && !editing && (
          <div className="flex gap-1.5 mt-2">
            {article.tags.split(',').map(tag => (<span key={tag} className="text-[10px] px-2 py-0.5 bg-emerald-900/20 text-emerald-400/70 rounded">{tag}</span>))}
          </div>
        )}
      </div>

      {/* Summary */}
      {(article.summary || editing) && (
        <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-3">摘要</h2>
          {editing ? (
            <textarea value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} rows={2}
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-300 resize-y focus:outline-none focus:border-emerald-500/50" />
          ) : (
            <p className="text-xs text-gray-400 italic border-l-2 border-emerald-500/30 pl-3">{article.summary}</p>
          )}
        </div>
      )}

      {/* AI Analysis */}
      {(article.ai_keywords || article.ai_summary) && !editing && (() => {
        const aiKw = article.ai_keywords ? JSON.parse(article.ai_keywords) : [];
        const aiEnt = article.ai_entities ? JSON.parse(article.ai_entities) : {};
        const entCategories = [
          { key: 'companies', label: '公司', icon: '🏢' },
          { key: 'drugs', label: '药品', icon: '💊' },
          { key: 'people', label: '人物', icon: '👤' },
          { key: 'organizations', label: '机构', icon: '🏛️' },
          { key: 'diseases', label: '疾病', icon: '🩺' },
          { key: 'mechanisms', label: '靶点/机制', icon: '🧬' },
        ];
        return (
          <div className="bg-gray-900/30 border border-cyan-800/30 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-cyan-400 flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                AI 分析
              </h2>
              {article.ai_analyzed_at && (
                <span className="text-[10px] text-gray-600">{new Date(article.ai_analyzed_at).toLocaleString('zh-CN')}</span>
              )}
            </div>
            {article.ai_summary && (
              <p className="text-xs text-gray-400 border-l-2 border-cyan-500/30 pl-3 mb-4">{article.ai_summary}</p>
            )}
            {aiKw.length > 0 && (
              <div className="mb-4">
                <span className="text-[10px] text-gray-500 mb-1.5 block">AI 关键词</span>
                <div className="flex flex-wrap gap-1.5">
                  {aiKw.map((kw: string) => (
                    <span key={kw} className="text-[10px] px-2 py-0.5 bg-cyan-900/20 text-cyan-400/80 rounded">{kw}</span>
                  ))}
                </div>
              </div>
            )}
            {Object.values(aiEnt).some((v: any) => Array.isArray(v) && v.length > 0) && (
              <div className="grid grid-cols-2 gap-3">
                {entCategories.map(({ key, label, icon }) => {
                  const items = aiEnt[key] || [];
                  if (items.length === 0) return null;
                  return (
                    <div key={key}>
                      <span className="text-[10px] text-gray-500 mb-1 block">{icon} {label}</span>
                      <div className="flex flex-wrap gap-1">
                        {items.map((item: string) => (
                          <span key={item} className="text-[10px] px-1.5 py-0.5 bg-gray-800/60 text-gray-400 rounded">{item}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Content */}
      <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">正文</h2>
          {!editing && (
            <div className="flex items-center gap-3">
              {ttsControls}
              <div className="w-px h-4 bg-gray-700/50" />
              <button onClick={enterReading} className="text-[10px] text-emerald-400/60 hover:text-emerald-400 transition-colors flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                阅读模式
              </button>
            </div>
          )}
        </div>
        {editing ? (
          <>
            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-1">标签（逗号分隔）</label>
              <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })}
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-emerald-500/50" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">正文内容</label>
              <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} rows={25}
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 text-xs text-gray-300 resize-y focus:outline-none focus:border-emerald-500/50 leading-6" />
            </div>
          </>
        ) : article.content_html ? (
          <div ref={normalContentElRef} onClick={handleContentClick} className="article-content prose prose-invert prose-sm max-w-none [&_p]:text-sm [&_p]:text-gray-300 [&_p]:leading-7 [&_p]:mb-4 [&_p]:cursor-pointer [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-white [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:cursor-pointer [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-5 [&_h2]:mb-3 [&_h2]:cursor-pointer [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-gray-200 [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:cursor-pointer [&_ul]:ml-4 [&_ul]:mb-3 [&_ul]:list-disc [&_ol]:ml-4 [&_ol]:mb-3 [&_ol]:list-decimal [&_li]:text-sm [&_li]:text-gray-300 [&_li]:leading-6 [&_li]:mb-1 [&_li]:cursor-pointer [&_blockquote]:border-l-2 [&_blockquote]:border-emerald-500/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-400 [&_blockquote]:mb-4 [&_blockquote]:cursor-pointer [&_img]:rounded-lg [&_img]:max-w-full [&_img]:my-4 [&_strong]:text-gray-200 [&_strong]:font-semibold [&_a]:text-emerald-400 [&_a]:underline [&_table]:w-full [&_table]:mb-4 [&_td]:px-2 [&_td]:py-1 [&_td]:text-xs [&_td]:border [&_td]:border-gray-700/50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-xs [&_th]:border [&_th]:border-gray-700/50 [&_th]:bg-gray-800/50"
            dangerouslySetInnerHTML={{ __html: article.content_html }} />
        ) : (
          <div className="text-sm text-gray-300 leading-7 whitespace-pre-wrap">
            {article.content || '暂无正文内容'}
          </div>
        )}
      </div>
    </div>
  );
}
