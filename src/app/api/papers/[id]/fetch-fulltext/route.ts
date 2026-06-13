import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import * as cheerio from 'cheerio';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = getDb();
    const paper = db.prepare(
      'SELECT id, title, doi, url FROM academic_papers WHERE id = ?'
    ).get(id) as any;

    if (!paper) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    let fullText: string | null = null;
    let source = '';

    // Strategy 1: arXiv HTML
    const arxivMatch = paper.url?.match(/arxiv\.org\/abs\/(.+?)(?:\?|$)/);
    if (arxivMatch) {
      const arxivId = arxivMatch[1];
      try {
        const res = await fetch(`https://arxiv.org/html/${arxivId}`, {
          headers: { 'User-Agent': 'InsightVault/1.0' },
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          $('nav, header, footer, .ltx_bibliography, .ltx_references, .ltx_page_footer, .ltx_page_header').remove();
          const text = $('.ltx_page_main').text().replace(/\s+/g, ' ').trim();
          if (text.length > 500) {
            fullText = text.substring(0, 30000);
            source = 'arXiv HTML';
          }
        }
      } catch { /* ignore */ }
    }

    // Strategy 2: PubMed Central via DOI
    if (!fullText && paper.doi) {
      try {
        // Use PMC OA API to find full text
        const pmcUrl = `https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi?id=${encodeURIComponent(paper.doi)}`;
        const pmcRes = await fetch(pmcUrl, {
          headers: { 'User-Agent': 'InsightVault/1.0' },
          signal: AbortSignal.timeout(10000),
        });
        if (pmcRes.ok) {
          const xml = await pmcRes.text();
          const $ = cheerio.load(xml, { xmlMode: true });
          const tgzUrl = $('record').first().find('link[format="tgz"]').attr('href') || '';
          // Try direct efetch from PMC ID
          const pmcId = $('record').first().attr('id') || $('article-id').first().text();
          if (pmcId) {
            const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${pmcId}&rettype=xml`;
            const ftRes = await fetch(fetchUrl, {
              headers: { 'User-Agent': 'InsightVault/1.0' },
              signal: AbortSignal.timeout(15000),
            });
            if (ftRes.ok) {
              const ftXml = await ftRes.text();
              const $$ = cheerio.load(ftXml, { xmlMode: true });
              $$('ref-list, fig, table-wrap, ack, back, fn-group, fn, label, xref').remove();
              const body = $$('body, sec, p').text().replace(/\s+/g, ' ').trim();
              if (body.length > 500) {
                fullText = body.substring(0, 30000);
                source = 'PubMed Central';
              }
            }
          }
        }
      } catch { /* ignore */ }
    }

    // Strategy 3: Semantic Scholar open access PDF via DOI
    if (!fullText && paper.doi) {
      try {
        const ssUrl = `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(paper.doi)}?fields=openAccessPdf`;
        const ssRes = await fetch(ssUrl, {
          headers: { 'User-Agent': 'InsightVault/1.0' },
          signal: AbortSignal.timeout(10000),
        });
        if (ssRes.ok) {
          const ssData = await ssRes.json();
          const pdfUrl = ssData.openAccessPdf?.url;
          if (pdfUrl) {
            // We can't parse PDF here, but return the URL for reference
            return NextResponse.json({
              error: 'Found open access PDF but cannot extract text automatically',
              pdfUrl,
              hint: 'You can download and import the PDF via the PDF upload tab',
            }, { status: 422 });
          }
        }
      } catch { /* ignore */ }
    }

    // Strategy 4: Try scraping the paper URL directly
    if (!fullText && paper.url) {
      try {
        const res = await fetch(paper.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          $('script, style, nav, header, footer, .sidebar, .menu, .breadcrumb, .references, #references').remove();
          // Try common article body selectors
          const body = $('article, .article-body, .paper-content, .abstract-content, #abstract, .main-content, main').text()
            .replace(/\s+/g, ' ').trim();
          if (body.length > 500) {
            fullText = body.substring(0, 30000);
            source = 'Web page';
          }
        }
      } catch { /* ignore */ }
    }

    if (!fullText) {
      return NextResponse.json({ error: '无法获取全文。该论文可能需要订阅，或没有开放获取版本。建议通过 PDF 导入上传全文。' }, { status: 404 });
    }

    // Store full text
    db.prepare('UPDATE academic_papers SET content = ? WHERE id = ?').run(fullText, id);

    return NextResponse.json({
      content: fullText.substring(0, 500) + '...',
      length: fullText.length,
      source,
    });
  } catch (err: any) {
    console.error('Fetch fulltext failed:', err);
    return NextResponse.json({ error: err.message || 'Fetch failed' }, { status: 500 });
  }
}
