import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

interface SearchResult {
  title: string;
  authors: string;
  abstract: string;
  content: string;
  journal: string;
  year: string;
  doi: string;
  url: string;
  source: 'semanticscholar' | 'pubmed' | 'arxiv';
  externalId: string;
}

export async function GET(req: NextRequest) {
  const query = new URL(req.url).searchParams.get('q');
  if (!query?.trim()) {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
  }

  const limit = parseInt(new URL(req.url).searchParams.get('limit') || '10');
  const results = await searchAll(query.trim(), limit);
  return NextResponse.json({ data: results, total: results.length });
}

async function searchAll(query: string, limit: number): Promise<SearchResult[]> {
  const [ssRes, pmRes, arxivRes] = await Promise.allSettled([
    searchSemanticScholar(query, limit),
    searchPubMed(query, limit),
    searchArxiv(query, limit),
  ]);

  const all: SearchResult[] = [];
  if (ssRes.status === 'fulfilled') all.push(...ssRes.value);
  if (pmRes.status === 'fulfilled') all.push(...pmRes.value);
  if (arxivRes.status === 'fulfilled') all.push(...arxivRes.value);

  // Deduplicate by DOI, then by normalized title
  const seen = new Map<string, SearchResult>();
  for (const r of all) {
    const key = r.doi ? `doi:${r.doi.toLowerCase()}` : `title:${r.title.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    if (!seen.has(key)) seen.set(key, r);
  }

  const deduped = Array.from(seen.values()).slice(0, limit * 2);

  return deduped;
}

async function searchSemanticScholar(query: string, limit: number): Promise<SearchResult[]> {
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=title,authors,abstract,year,journal,externalIds,url`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'InsightVault/1.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];

  const data = await res.json();
  return (data.data || []).map((p: any): SearchResult => ({
    title: p.title || '',
    authors: (p.authors || []).map((a: any) => a.name).join(', '),
    abstract: p.abstract || '',
    content: '',
    journal: p.journal?.name || '',
    year: p.year?.toString() || '',
    doi: p.externalIds?.DOI || '',
    url: p.url || `https://semanticscholar.org/paper/${p.paperId}`,
    source: 'semanticscholar',
    externalId: p.paperId || '',
  }));
}

async function searchPubMed(query: string, limit: number): Promise<SearchResult[]> {
  // Step 1: Search for IDs
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${limit}&retmode=json`;
  const searchRes = await fetch(searchUrl, {
    headers: { 'User-Agent': 'InsightVault/1.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!searchRes.ok) return [];

  const searchData = await searchRes.json();
  const ids: string[] = searchData?.esearchresult?.idlist || [];
  if (ids.length === 0) return [];

  // Step 2: Fetch abstracts via efetch (gets abstract text)
  const efetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(',')}&rettype=abstract&retmode=xml`;
  const [summaryRes, efetchRes] = await Promise.allSettled([
    fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`, {
      headers: { 'User-Agent': 'InsightVault/1.0' },
      signal: AbortSignal.timeout(10000),
    }),
    fetch(efetchUrl, {
      headers: { 'User-Agent': 'InsightVault/1.0' },
      signal: AbortSignal.timeout(10000),
    }),
  ]);

  // Parse abstracts from efetch XML
  const abstracts = new Map<string, string>();
  if (efetchRes.status === 'fulfilled' && efetchRes.value.ok) {
    const xml = await efetchRes.value.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    $('PubmedArticle').each(function () {
      const pmid = $(this).find('PMID').first().text().trim();
      const abstractTexts: string[] = [];
      $(this).find('AbstractText').each(function () {
        const label = $(this).attr('label');
        const text = $(this).text().trim();
        if (label) abstractTexts.push(`${label}: ${text}`);
        else abstractTexts.push(text);
      });
      if (abstractTexts.length > 0) abstracts.set(pmid, abstractTexts.join('\n'));
    });
  }

  // Parse metadata from summary
  const results: SearchResult[] = [];
  if (summaryRes.status === 'fulfilled' && summaryRes.value.ok) {
    const summaryData = await summaryRes.value.json();
    for (const id of ids) {
      const item = summaryData?.result?.[id];
      if (!item) continue;
      const authors = (item.authors || []).map((a: any) => a.name).join(', ');
      const doiId = (item.articleids || []).find((a: any) => a.idtype === 'doi')?.value || '';

      results.push({
        title: item.title || '',
        authors,
        abstract: abstracts.get(id) || '',
        content: '',
        journal: item.fulljournalname || item.source || '',
        year: item.pubdate?.substring(0, 4) || '',
        doi: doiId,
        url: doiId ? `https://doi.org/${doiId}` : `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        source: 'pubmed',
        externalId: id,
      });
    }
  }

  return results;
}

async function searchArxiv(query: string, limit: number): Promise<SearchResult[]> {
  const url = `http://export.arxiv.org/api/query?search_query=ti:${encodeURIComponent(query)}&max_results=${limit}&sortBy=relevance`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'InsightVault/1.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];

  const xml = await res.text();
  const $ = cheerio.load(xml, { xmlMode: true });

  const results: SearchResult[] = [];
  $('entry').each(function () {
    const title = $(this).find('title').first().text().replace(/\s+/g, ' ').trim();
    const authors = $(this).find('author > name').map(function () { return $(this).text().trim(); }).get().join(', ');
    const abstract = $(this).find('summary').text().replace(/\s+/g, ' ').trim();
    const id = $(this).find('id').first().text().trim();
    const published = $(this).find('published').text().trim();
    const year = published ? published.substring(0, 4) : '';
    const doiEl = $(this).find('arxiv\\:doi').text().trim() || $(this).find('doi').text().trim();
    const categories = $(this).find('category').map(function () { return $(this).attr('term'); }).get().join(', ');

    results.push({
      title,
      authors,
      abstract,
      content: '',
      journal: categories || 'arXiv',
      year,
      doi: doiEl || '',
      url: id,
      source: 'arxiv',
      externalId: id,
    });
  });

  return results;
}
