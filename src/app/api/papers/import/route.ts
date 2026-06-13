import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import getDb from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, topic_id, tags } = body;

    if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 });

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return NextResponse.json({ error: `Failed to fetch URL: ${res.status}` }, { status: 502 });

    const html = await res.text();
    const $ = cheerio.load(html);

    let title = '';
    let authors = '';
    let abstract = '';
    let journal = '';
    let year = '';
    let doi = '';
    let keywords = '';

    // Try citation meta tags (common on PubMed, Springer, etc.)
    title = $('meta[name="citation_title"]').attr('content')
      || $('meta[name="dc.title"]').attr('content')
      || $('meta[property="og:title"]').attr('content')
      || $('title').text().trim()
      || $('h1').first().text().trim();

    authors = $('meta[name="citation_author"]').map(function() { return $(this).attr('content'); }).get().join(', ')
      || $('meta[name="dc.creator"]').attr('content')
      || $('meta[name="author"]').attr('content')
      || '';

    journal = $('meta[name="citation_journal_title"]').attr('content')
      || $('meta[name="citation_conference_title"]').attr('content')
      || $('meta[name="dc.publisher"]').attr('content')
      || '';

    year = $('meta[name="citation_date"]').attr('content')
      || $('meta[name="citation_publication_date"]').attr('content')
      || $('meta[name="dc.date"]').attr('content')
      || '';

    doi = $('meta[name="citation_doi"]').attr('content')
      || $('meta[name="dc.identifier"]').attr('content')
      || '';

    abstract = $('meta[name="citation_abstract"]').attr('content')
      || $('meta[name="dc.description"]').attr('content')
      || $('meta[name="description"]').attr('content')
      || $('meta[property="og:description"]').attr('content')
      || '';

    keywords = $('meta[name="citation_keywords"]').map(function() { return $(this).attr('content'); }).get().join(', ')
      || $('meta[name="keywords"]').attr('content')
      || '';

    if (!title) return NextResponse.json({ error: 'Could not extract paper title' }, { status: 422 });

    // Clean up extracted data
    title = title.replace(/\s+/g, ' ').trim();
    if (year && year.length > 10) year = year.substring(0, 4);

    const db = getDb();
    const info = db.prepare(
      `INSERT INTO academic_papers (title, authors, abstract, journal, year, doi, url, keywords, topic_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(title, authors || null, abstract || null, journal || null, year || null, doi || null, url, keywords || null, topic_id || null);

    const paperId = info.lastInsertRowid as number;

    if (tags && tags.length > 0) {
      const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
      const getTag = db.prepare('SELECT id FROM tags WHERE name = ?');
      const linkTag = db.prepare('INSERT OR IGNORE INTO paper_tags (paper_id, tag_id) VALUES (?, ?)');
      for (const name of tags) {
        insertTag.run(name);
        const tagId = (getTag.get(name) as any).id;
        linkTag.run(paperId, tagId);
      }
    }

    return NextResponse.json({
      id: paperId, title, authors, journal, year, doi,
      message: 'Paper imported',
    }, { status: 201 });
  } catch (err: any) {
    console.error('Failed to import paper:', err);
    return NextResponse.json({ error: err.message || 'Import failed' }, { status: 500 });
  }
}
