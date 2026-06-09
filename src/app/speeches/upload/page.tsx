'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface TopicOption {
  id: number;
  name: string;
  children: TopicOption[];
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

function toTopicOption(t: any): TopicOption {
  return { id: t.id, name: t.name, children: (t.children || []).map((c: any) => toTopicOption(c)) };
}

type Tab = 'zip' | 'iflyrec';

export default function UploadSpeechPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('iflyrec');

  // ZIP upload state
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);

  // iFlyrec import state
  const [shareUrl, setShareUrl] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [previewError, setPreviewError] = useState('');
  const [conference, setConference] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [speechDate, setSpeechDate] = useState('');
  const [topicId, setTopicId] = useState<number | ''>('');
  const [tagsInput, setTagsInput] = useState('');

  // Topics for dropdown
  const [topics, setTopics] = useState<TopicOption[]>([]);

  useEffect(() => {
    fetch('/api/topics').then(r => r.json()).then((data: any[]) => {
      setTopics(data.map((t: any) => toTopicOption(t)));
    });
  }, []);

  const handleZipSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUploading(true);

    const form = e.currentTarget;
    const fd = new FormData(form);
    const formData = new FormData();
    formData.append('file', (form.file as any).files[0]);
    formData.append('title', fd.get('title') as string);
    formData.append('conference', fd.get('conference') as string);
    formData.append('speaker', fd.get('speaker') as string);
    formData.append('speech_date', fd.get('speech_date') as string);
    formData.append('tags', fd.get('tags') as string);

    try {
      const res = await fetch('/api/speeches/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
      } else {
        alert(data.error || '上传失败');
      }
    } catch {
      alert('上传失败');
    }
    setUploading(false);
  };

  const handlePreview = async () => {
    if (!shareUrl.trim()) return;
    setPreviewing(true);
    setPreviewError('');
    setPreview(null);
    try {
      const res = await fetch('/api/speeches/import-iflyrec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', shareUrl }),
      });
      const data = await res.json();
      if (res.ok && data.preview) {
        setPreview(data.preview);
        // Auto-fill metadata from preview
        setConference(data.preview.title || '');
        setSpeechDate(data.preview.speechDate || '');
        if (data.preview.suggestedTags?.length) {
          setTagsInput(data.preview.suggestedTags.join(', '));
        }
      } else {
        setPreviewError(data.error || '解析失败');
      }
    } catch {
      setPreviewError('网络错误，请重试');
    }
    setPreviewing(false);
  };

  const handleImport = async () => {
    if (!preview) return;
    setImporting(true);
    try {
      const tags = tagsInput.split(/[,，]/).map((t: string) => t.trim()).filter(Boolean);
      const res = await fetch('/api/speeches/import-iflyrec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import',
          shareUrl,
          conference,
          speaker,
          speechDate,
          topicId: topicId || null,
          tags,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        router.push(`/speeches/${data.speechId}`);
      } else {
        alert(data.error || '导入失败');
      }
    } catch {
      alert('导入失败');
    }
    setImporting(false);
  };

  const formatDuration = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}小时${m}分${s}秒`;
    return `${m}分${s}秒`;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <button onClick={() => router.push('/speeches')} className="text-xs text-gray-500 hover:text-gray-300 mb-2 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          返回列表
        </button>
        <h1 className="text-xl font-bold text-white">导入演讲</h1>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 bg-gray-900/50 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('iflyrec')}
          className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'iflyrec' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          讯飞听见链接
        </button>
        <button
          onClick={() => setActiveTab('zip')}
          className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'zip' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          ZIP 包上传
        </button>
      </div>

      {/* iFlyrec Import Tab */}
      {activeTab === 'iflyrec' && (
        <div className="space-y-4">
          {/* URL Input */}
          <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-6 space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">讯飞听见分享链接</label>
              <div className="flex gap-2">
                <input
                  value={shareUrl}
                  onChange={(e) => { setShareUrl(e.target.value); setPreview(null); setPreviewError(''); }}
                  placeholder="粘贴 shareaudio.iflyrec.com 分享链接..."
                  className="flex-1 bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50"
                />
                <button
                  onClick={handlePreview}
                  disabled={previewing || !shareUrl.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded-lg whitespace-nowrap"
                >
                  {previewing ? '解析中...' : '解析'}
                </button>
              </div>
              <p className="text-[10px] text-gray-600 mt-1">示例: https://shareaudio.iflyrec.com/appShare/share.html?audioId=SAT2xxx</p>
            </div>

            {previewError && (
              <div className="text-xs text-red-400 bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2">
                {previewError}
              </div>
            )}
          </div>

          {/* Preview */}
          {preview && (
            <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">{preview.title}</h3>
                  <p className="text-[10px] text-gray-500">
                    时长 {formatDuration(preview.duration)} · {preview.images.length} 张照片 · {preview.paragraphs.length} 段字幕
                    {preview.paragraphs.length > 0 && (
                      <> · {(preview.roles || []).map((r: any) => r.name).join(', ')}</>
                    )}
                  </p>
                </div>
              </div>

              {/* Image thumbnails */}
              {preview.images.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-2">
                  {preview.images.slice(0, 8).map((img: any, i: number) => (
                    <div key={i} className="shrink-0 w-16 h-12 rounded bg-gray-800/50 border border-gray-700/30 overflow-hidden">
                      <img src={img.thumbnail || img.path} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))}
                  {preview.images.length > 8 && (
                    <div className="shrink-0 w-16 h-12 rounded bg-gray-800/50 border border-gray-700/30 flex items-center justify-center text-[10px] text-gray-500">
                      +{preview.images.length - 8}
                    </div>
                  )}
                </div>
              )}

              {/* Transcript preview */}
              {preview.paragraphs.length > 0 && (
                <div className="bg-gray-800/30 rounded-lg p-3 max-h-32 overflow-y-auto">
                  {preview.paragraphs.slice(0, 5).map((p: any, i: number) => (
                    <p key={i} className="text-[11px] text-gray-400 leading-relaxed">
                      <span className="text-gray-600">[{p.time}]</span>{' '}
                      <span className="text-blue-400/70">{p.roleName}:</span>{' '}
                      {p.text.slice(0, 80)}{p.text.length > 80 ? '...' : ''}
                    </p>
                  ))}
                  {preview.paragraphs.length > 5 && (
                    <p className="text-[10px] text-gray-600 mt-1">... 还有 {preview.paragraphs.length - 5} 段</p>
                  )}
                </div>
              )}

              <hr className="border-gray-800/40" />

              {/* Metadata fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">会议名称</label>
                  <input value={conference} onChange={(e) => setConference(e.target.value)}
                    className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">演讲者</label>
                  <input value={speaker} onChange={(e) => setSpeaker(e.target.value)}
                    className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">演讲日期</label>
                  <input type="date" value={speechDate} onChange={(e) => setSpeechDate(e.target.value)}
                    className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">话题</label>
                  <select value={topicId} onChange={(e) => setTopicId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50">
                    <option value="">不选择</option>
                    {flattenTopics(topics).map(t => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">标签（逗号分隔，已自动生成）</label>
                <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)}
                  className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50" />
              </div>

              <button onClick={handleImport} disabled={importing}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
                {importing ? '导入中（下载音频和图片）...' : '确认导入'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ZIP Upload Tab */}
      {activeTab === 'zip' && (
        result ? (
          <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-6 space-y-3">
            <div className="text-sm font-semibold text-emerald-400">上传成功!</div>
            <div className="text-xs text-gray-400 space-y-1">
              <p>PPT 图片: {result.slidesCount} 张</p>
              <p>录音: {result.hasAudio ? '有' : '无'}</p>
              <p>字幕文本: {result.hasTranscript ? '有' : '无'}</p>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => router.push(`/speeches/${result.id}`)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg">
                查看详情
              </button>
              <button onClick={() => setResult(null)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg">
                继续上传
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleZipSubmit} className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-6 space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">标题 *</label>
              <input name="title" required className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">会议名称</label>
                <input name="conference" className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">演讲者</label>
                <input name="speaker" className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">演讲日期</label>
              <input name="speech_date" type="date" className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">标签（逗号分隔）</label>
              <input name="tags" placeholder="如: 医药,创新药,ADC" className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">讯飞听见 zip 包 *</label>
              <input name="file" type="file" accept=".zip" required className="w-full text-xs text-gray-400 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-xs file:bg-blue-600/30 file:text-blue-400 hover:file:bg-blue-600/40" />
            </div>
            <button type="submit" disabled={uploading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
              {uploading ? '上传中...' : '上传'}
            </button>
          </form>
        )
      )}
    </div>
  );
}
