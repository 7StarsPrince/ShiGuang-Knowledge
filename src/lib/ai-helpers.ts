import getDb from './db';
import { analyzeContent } from './llm';
import { AnalysisResult } from './llm-prompt';

export type ContentType = 'article' | 'speech' | 'paper';

interface ContentItem {
  id: number;
  title: string;
  text: string;
}

function getContentForAnalysis(type: ContentType, row: any): string {
  switch (type) {
    case 'article':
      return row.content || row.content_html || row.summary || '';
    case 'paper':
      return [row.abstract, row.content].filter(Boolean).join('\n\n');
    case 'speech':
      return row.transcript || '';
    default:
      return '';
  }
}

function getTable(type: ContentType): string {
  switch (type) {
    case 'article': return 'articles';
    case 'paper': return 'academic_papers';
    case 'speech': return 'speeches';
  }
}

export function fetchContent(type: ContentType, id: number): ContentItem | null {
  const db = getDb();
  const table = getTable(type);
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as any;
  if (!row) return null;
  return { id: row.id, title: row.title, text: getContentForAnalysis(type, row) };
}

export function storeAnalysis(type: ContentType, id: number, result: AnalysisResult): void {
  const db = getDb();
  const table = getTable(type);
  db.prepare(
    `UPDATE ${table} SET ai_keywords = ?, ai_summary = ?, ai_entities = ?, ai_analyzed_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(result.keywords), result.summary, JSON.stringify(result.entities), id);
}

export async function analyzeAndStore(type: ContentType, id: number): Promise<AnalysisResult> {
  const item = fetchContent(type, id);
  if (!item) throw new Error(`${type} ${id} not found`);

  const result = await analyzeContent(item.title, item.text);
  storeAnalysis(type, id, result);
  return result;
}

export function getAllUnanalyzed(type?: ContentType): Array<{ type: ContentType; id: number; title: string }> {
  const db = getDb();
  const items: Array<{ type: ContentType; id: number; title: string }> = [];

  const types: ContentType[] = type ? [type] : ['article', 'speech', 'paper'];
  for (const t of types) {
    const table = getTable(t);
    const rows = db.prepare(
      `SELECT id, title FROM ${table} WHERE ai_analyzed_at IS NULL ORDER BY id`
    ).all() as any[];
    for (const r of rows) {
      items.push({ type: t, id: r.id, title: r.title });
    }
  }
  return items;
}

export function getAnalysisStats(): Record<ContentType, { total: number; analyzed: number }> {
  const db = getDb();
  const stats: Record<string, { total: number; analyzed: number }> = {};
  const types: ContentType[] = ['article', 'speech', 'paper'];

  for (const t of types) {
    const table = getTable(t);
    const total = (db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as any).c;
    const analyzed = (db.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE ai_analyzed_at IS NOT NULL`).get() as any).c;
    stats[t] = { total, analyzed };
  }
  return stats as Record<ContentType, { total: number; analyzed: number }>;
}
