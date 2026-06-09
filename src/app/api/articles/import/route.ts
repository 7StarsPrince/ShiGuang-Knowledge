import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import getDb from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Fetch the article page
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

    // Extract fields — works for WeChat articles (mp.weixin.qq.com) and general web pages
    let title = '';
    let author = '';
    let content = '';
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

      // WeChat article body
      const contentHtml = $('#js_content').html() || '';
      content = $('#js_content').text().trim();

      // Try to extract summary from meta
      summary = $('meta[property="og:description"]').attr('content')
        || $('meta[name="description"]').attr('content')
        || content.slice(0, 200);
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
      content = $('article').text().trim() || $('main').text().trim() || $('body').text().trim();
    }

    if (!title) {
      return NextResponse.json({ error: 'Could not extract article title' }, { status: 422 });
    }

    // Save to database
    const db = getDb();
    const info = db.prepare(
      `INSERT INTO articles (title, source_name, source_url, author, summary, content, cover_image, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      title,
      sourceName || null,
      url,
      author || null,
      summary || null,
      content || null,
      coverImage || null,
      publishedAt || null,
    );

    const articleId = info.lastInsertRowid as number;

    return NextResponse.json({
      id: articleId,
      title,
      author,
      sourceName,
      message: 'Article imported',
    }, { status: 201 });
  } catch (err: any) {
    console.error('Failed to import article:', err);
    return NextResponse.json({ error: err.message || 'Import failed' }, { status: 500 });
  }
}
