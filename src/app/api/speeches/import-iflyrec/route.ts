import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import path from 'path';
import fs from 'fs';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'speeches');

// Step 1: Parse share URL and preview data
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, shareUrl, conference, speaker, speakerOrg, speechDate, topicId, tags } = body;

    // Extract audioId from URL
    const audioId = extractAudioId(shareUrl);
    if (!audioId) {
      return NextResponse.json({ error: '无法从链接中提取 audioId，请检查链接格式' }, { status: 400 });
    }

    // Fetch data from iFlytek API
    const iflyrecData = await fetchIflyrecData(audioId);
    if (!iflyrecData) {
      return NextResponse.json({ error: '无法获取讯飞听见数据，请检查链接是否有效' }, { status: 400 });
    }

    // Preview mode: just return parsed data without saving
    if (action === 'preview') {
      return NextResponse.json({ preview: iflyrecData });
    }

    // Import mode needs iflyrecData.title for directory naming
    const title = iflyrecData.title;

    // Import mode: download assets and save to DB
    if (action === 'import') {
      const speechDir = path.join(UPLOAD_DIR, `${Date.now()}-${sanitize(iflyrecData.title)}`);
      fs.mkdirSync(speechDir, { recursive: true });

      // Download audio
      let audioPath = '';
      if (iflyrecData.audioUrl) {
        const audioExt = guessExt(iflyrecData.audioUrl) || '.mp3';
        const audioFile = path.join(speechDir, `audio${audioExt}`);
        await downloadFile(iflyrecData.audioUrl, audioFile);
        audioPath = path.relative(process.cwd(), audioFile);
      }

      // Download images (thumbnails for efficiency)
      const slides: Array<{ order: number; image_path: string; slide_time: number }> = [];
      for (let i = 0; i < iflyrecData.images.length; i++) {
        const img = iflyrecData.images[i];
        const imgUrl = img.thumbnail || img.path;
        const ext = guessExt(imgUrl) || '.jpg';
        const imgFile = path.join(speechDir, `slide_${String(i).padStart(3, '0')}${ext}`);
        try {
          await downloadFile(imgUrl, imgFile);
          slides.push({
            order: i,
            image_path: path.relative(process.cwd(), imgFile),
            slide_time: img.time || 0,
          });
        } catch (e) {
          console.error(`Failed to download image ${i}:`, e);
        }
      }

      // Build transcript text from paragraphs
      const transcriptText = iflyrecData.paragraphs
        .map((p: { time: string; roleName: string; text: string }) => `[${p.time}] ${p.roleName}: ${p.text}`)
        .join('\n\n');

      // Save to database
      const db = getDb();
      const info = db.prepare(`
        INSERT INTO speeches (title, conference, speaker, speaker_org, speech_date, topic_id, transcript, transcript_json, audio_path, audio_duration, source_url, iflyrec_audio_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        title,
        conference || '',
        speaker || '',
        speakerOrg || '',
        speechDate || '',
        topicId || null,
        transcriptText,
        JSON.stringify(iflyrecData.rawParagraphs),
        audioPath,
        iflyrecData.duration,
        shareUrl,
        audioId,
      );

      const speechId = info.lastInsertRowid as number;

      // Insert slides
      const insertSlide = db.prepare(
        'INSERT INTO speech_slides (speech_id, slide_order, slide_time, image_path) VALUES (?, ?, ?, ?)',
      );
      for (const slide of slides) {
        insertSlide.run(speechId, slide.order, slide.slide_time, slide.image_path);
      }

      // Insert tags
      if (tags && Array.isArray(tags) && tags.length > 0) {
        const ensureTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
        const getTag = db.prepare('SELECT id FROM tags WHERE name = ?');
        const linkTag = db.prepare('INSERT OR IGNORE INTO speech_tags (speech_id, tag_id) VALUES (?, ?)');
        for (const tagName of tags) {
          const trimmed = tagName.trim();
          if (!trimmed) continue;
          ensureTag.run(trimmed);
          const tag = getTag.get(trimmed) as any;
          if (tag) linkTag.run(speechId, tag.id);
        }
      }

      return NextResponse.json({
        success: true,
        speechId,
        title: iflyrecData.title,
        stats: {
          images: slides.length,
          duration: iflyrecData.duration,
          paragraphs: iflyrecData.paragraphs.length,
        },
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    console.error('Import iFlytec error:', err);
    return NextResponse.json({ error: err.message || '导入失败' }, { status: 500 });
  }
}

// --- Helpers ---

function extractAudioId(url: string): string | null {
  // Match audioId from query param: ?audioId=SAT2xxx
  const paramMatch = url.match(/[?&]audioId=([^&]+)/);
  if (paramMatch) return paramMatch[1];
  // Match from path: /share/SAT2xxx or /SAT2xxx
  const pathMatch = url.match(/(SAT[a-f0-9]+)/i);
  if (pathMatch) return pathMatch[1];
  return null;
}

async function fetchIflyrecData(audioId: string) {
  const apiUrl = `https://shareaudio.iflyrec.com/ShareAudioService/v1/audioShares/${audioId}`;
  const res = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Referer: 'https://shareaudio.iflyrec.com/',
    },
  });
  if (!res.ok) return null;

  const data = await res.json();
  if (data.code !== '000000') return null;

  const biz = data.biz || {};
  const contentStr = biz.transcriptResult?.content || '{}';
  const content = JSON.parse(contentStr);

  // Extract roles
  const roleMap: Record<string, string> = {};
  for (const r of content.roles || []) {
    roleMap[r.role] = r.name;
  }

  // Extract paragraphs
  const paragraphs = (content.ps || []).map((p: any) => {
    const pTime = p.pTime || [0, 0];
    const bg = pTime[0] || 0;
    const text = (p.words || []).map((w: any) => w.text || '').join('');
    const roleName = roleMap[p.role] || `角色${p.role}`;
    return {
      time: formatTime(bg),
      timeMs: bg,
      role: p.role,
      roleName,
      text,
    };
  });

  // Extract images
  const images = (content.images || []).map((img: any) => ({
    fileId: img.fileId,
    path: img.path,
    thumbnail: img.thumbnail,
    time: img.time || 0,
    w: img.w,
    h: img.h,
  }));

  // Extract date from various possible fields
  const rawDate = biz.createTime || biz.audioCreateTime || biz.startTime || biz.recordTime || '';
  let speechDate = '';
  if (rawDate) {
    const d = new Date(typeof rawDate === 'number' ? rawDate : rawDate);
    if (!isNaN(d.getTime())) {
      speechDate = d.toISOString().slice(0, 10);
    }
  }

  // Generate suggested tags from transcript
  const fullText = paragraphs.map((p: any) => p.text).join(' ');
  const suggestedTags = extractTags(biz.audioName || '', fullText);

  return {
    title: biz.audioName || '未命名演讲',
    audioUrl: biz.audioPlayUrl || '',
    duration: biz.audioDuration || 0,
    orderId: biz.orderId || '',
    images,
    paragraphs,
    rawParagraphs: content.ps || [],
    roles: content.roles || [],
    speechDate,
    suggestedTags,
  };
}

// Chinese stopwords for tag filtering
const STOPWORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
  '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
  '自己', '这', '他', '她', '它', '们', '那', '个', '什么', '怎么', '为什么',
  '可以', '因为', '所以', '但是', '而且', '如果', '然后', '还是', '已经', '可能',
  '应该', '需要', '能够', '这个', '那个', '这些', '那些', '一些', '这样', '那样',
  '我们', '他们', '你们', '大家', '现在', '之前', '之后', '通过', '进行', '关于',
  '以及', '对于', '之间', '比较', '非常', '时候', '知道', '觉得', '认为', '希望',
  '其实', '当然', '所以', '研究', '分析', '情况', '问题', '方面', '关系', '发展',
]);

function extractTags(title: string, fullText: string): string[] {
  const tags: string[] = [];

  // 1. Extract English acronyms and terms (2+ chars, mixed case allowed)
  const englishPattern = /[A-Za-z][A-Za-z0-9./\-]+/g;
  const titleTerms = new Set((title.match(englishPattern) || []).map(t => t.toUpperCase()));

  const allTerms: Record<string, number> = {};
  const text = `${title} ${fullText}`;
  let m: RegExpExecArray | null;
  englishPattern.lastIndex = 0;
  while ((m = englishPattern.exec(text)) !== null) {
    const term = m[0];
    // Filter out very common/noise terms
    if (term.length < 2) continue;
    const upper = term.toUpperCase();
    // Keep if it's an acronym (2-6 uppercase chars) or appears multiple times or is in title
    const isAcronym = /^[A-Z]{2,6}$/.test(term) || /^[A-Z][A-Z0-9.\-]{1,10}$/.test(term);
    allTerms[upper] = (allTerms[upper] || 0) + 1;
    if (titleTerms.has(upper) || isAcronym) {
      allTerms[upper] = (allTerms[upper] || 0) + 5; // Boost
    }
  }

  // Take top English terms
  const sortedEnglish = Object.entries(allTerms)
    .filter(([term, count]) => {
      // Filter noise: common English words
      if (['THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'OUT'].includes(term)) return false;
      return count >= 2;
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([term]) => term);

  tags.push(...sortedEnglish);

  // 2. Extract high-frequency Chinese bigrams (2-char) and 4-char phrases
  const chineseText = fullText.replace(/[^\u4e00-\u9fa5]/g, '');
  const bigramCounts: Record<string, number> = {};
  for (let i = 0; i < chineseText.length - 1; i++) {
    const bg = chineseText.slice(i, i + 2);
    if (!STOPWORDS.has(bg) && !STOPWORDS.has(bg[0]) && !STOPWORDS.has(bg[1])) {
      bigramCounts[bg] = (bigramCounts[bg] || 0) + 1;
    }
  }

  // Take bigrams that appear frequently (relative to text length)
  const minFreq = Math.max(3, Math.floor(chineseText.length / 500));
  const sortedBigrams = Object.entries(bigramCounts)
    .filter(([, count]) => count >= minFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([term]) => term);

  tags.push(...sortedBigrams);

  return tags.slice(0, 8);
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').slice(0, 50);
}

function guessExt(url: string): string {
  // Try to guess extension from URL path (before query params)
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp3', '.wav', '.m4a', '.aac'].includes(ext)) return ext;
  } catch {}
  return '';
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Referer: 'https://shareaudio.iflyrec.com/',
    },
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
}
