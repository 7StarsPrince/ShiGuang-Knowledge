import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const IMAGES_DIR = path.join(process.cwd(), 'uploads', 'articles');

function resolveImageUrl(src: string, sourceUrl: string): string | null {
  let url = src.trim();
  if (!url || url.startsWith('data:')) return null;
  if (url.startsWith('//')) url = 'https:' + url;
  else if (url.startsWith('/')) url = new URL(sourceUrl).origin + url;
  if (!url.startsWith('http')) return null;
  return url;
}

async function downloadImage(imgUrl: string, referer: string): Promise<string | null> {
  try {
    const res = await fetch(imgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
        'Referer': referer,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';
    let ext = '.jpg';
    if (contentType.includes('png')) ext = '.png';
    else if (contentType.includes('gif')) ext = '.gif';
    else if (contentType.includes('webp')) ext = '.webp';

    const urlExt = path.extname(new URL(imgUrl).pathname).split('?')[0].toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(urlExt)) ext = urlExt;

    const filename = crypto.randomBytes(8).toString('hex') + ext;
    const buffer = Buffer.from(await res.arrayBuffer());

    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    fs.writeFileSync(path.join(IMAGES_DIR, filename), buffer);

    return `/api/uploads/articles/${filename}`;
  } catch {
    return null;
  }
}

async function localizeImages(html: string, sourceUrl: string): Promise<string> {
  if (!html) return html;
  const $ = cheerio.load(html);
  const imgs = $('img').toArray();

  // Download in parallel (batches of 5 to avoid overwhelming CDN)
  for (let i = 0; i < imgs.length; i += 5) {
    const batch = imgs.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(async (img) => {
        // WeChat uses data-src for lazy-loaded images
        const rawUrl = $(img).attr('data-src') || $(img).attr('src');
        if (!rawUrl) return null;
        const resolved = resolveImageUrl(rawUrl, sourceUrl);
        if (!resolved) return null;
        return downloadImage(resolved, sourceUrl);
      })
    );
    batch.forEach((img, j) => {
      if (results[j]) {
        $(img).attr('src', results[j]!);
        $(img).removeAttr('data-src');
      }
    });
  }

  return $('body').html() || html;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch URL: ${res.status}` }, { status: 502 });
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    let title = '';
    let author = '';
    let contentText = '';
    let contentHtml = '';
    let summary = '';
    let coverImage = '';
    let sourceName = '';
    let publishedAt = '';

    const isWeChat = url.includes('mp.weixin.qq.com');

    if (isWeChat) {
      title = $('#activity-name').text().trim() || $('h1').first().text().trim();
      author = $('#js_name').text().trim() || $('meta[name="author"]').attr('content') || '';
      sourceName = $('#profileBt a .profile_nickname').text().trim() || author;
      publishedAt = $('#publish_time').text().trim() || '';
      coverImage = $('meta[property="og:image"]').attr('content') || '';

      const $content = $('#js_content');
      contentHtml = $content.html() || '';
      contentText = $content.text().trim();

      // Download images before cleaning (need data-src for WeChat lazy loading)
      contentHtml = await localizeImages(contentHtml, url);

      // Remove inline styles but keep structure tags
      const $clean = cheerio.load(contentHtml);
      $clean('*').each(function() {
        $(this).removeAttr('style');
        $(this).removeAttr('class');
        $(this).removeAttr('data-');
      });
      contentHtml = $clean.html() || '';

      summary = $('meta[property="og:description"]').attr('content')
        || $('meta[name="description"]').attr('content')
        || contentText.slice(0, 200);
    } else {
      title = $('meta[property="og:title"]').attr('content')
        || $('title').text().trim()
        || $('h1').first().text().trim();
      author = $('meta[name="author"]').attr('content') || '';
      sourceName = $('meta[property="og:site_name"]').attr('content') || new URL(url).hostname;
      publishedAt = $('meta[property="article:published_time"]').attr('content')
        || $('time').attr('datetime')
        || '';
      coverImage = $('meta[property="og:image"]').attr('content') || '';
      summary = $('meta[property="og:description"]').attr('content')
        || $('meta[name="description"]').attr('content')
        || '';

      const $article = $('article').first();
      if ($article.length) {
        contentHtml = $article.html() || '';
        contentText = $article.text().trim();
      } else {
        const $main = $('main').first();
        if ($main.length) {
          contentHtml = $main.html() || '';
          contentText = $main.text().trim();
        } else {
          contentText = $('body').text().trim();
          contentHtml = '';
        }
      }

      // Download images for non-WeChat articles too
      contentHtml = await localizeImages(contentHtml, url);
    }

    // Download cover image
    if (coverImage) {
      const resolved = resolveImageUrl(coverImage, url);
      if (resolved) {
        const localCover = await downloadImage(resolved, url);
        if (localCover) coverImage = localCover;
      }
    }

    if (!title) {
      return NextResponse.json({ error: 'Could not extract article title' }, { status: 422 });
    }

    return NextResponse.json({
      title,
      author,
      sourceName,
      sourceUrl: url,
      summary,
      contentText,
      contentHtml,
      coverImage,
      publishedAt,
    }, { status: 200 });
  } catch (err: any) {
    console.error('Failed to import article:', err);
    return NextResponse.json({ error: err.message || 'Import failed' }, { status: 500 });
  }
}
