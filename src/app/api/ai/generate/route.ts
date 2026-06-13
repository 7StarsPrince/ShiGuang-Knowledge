import { NextRequest } from 'next/server';
import getDb from '@/lib/db';
import { getLLMConfig } from '@/lib/llm';

interface RefItem {
  type: 'article' | 'speech' | 'paper';
  id: number;
}

function getContentText(type: string, row: any): string {
  switch (type) {
    case 'article': return row.content || row.content_html || row.summary || '';
    case 'paper': return [row.abstract, row.content].filter(Boolean).join('\n\n');
    case 'speech': return row.transcript || '';
    default: return '';
  }
}

function getTable(type: string): string {
  switch (type) {
    case 'article': return 'articles';
    case 'paper': return 'academic_papers';
    case 'speech': return 'speeches';
    default: return '';
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { references, messages, systemPrompt } = body as {
      references: RefItem[];
      messages: { role: string; content: string }[];
      systemPrompt?: string;
    };

    if (!messages?.length) {
      return new Response(JSON.stringify({ error: 'Messages are required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch reference content from DB
    const db = getDb();
    const refTexts: string[] = [];
    for (const ref of (references || [])) {
      const table = getTable(ref.type);
      if (!table) continue;
      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(ref.id) as any;
      if (!row) continue;
      const text = getContentText(ref.type, row);
      // Truncate each ref to ~3000 chars
      const truncated = text.length > 3000 ? text.slice(0, 3000) + '...(截断)' : text;
      const typeLabel = ref.type === 'article' ? '文章' : ref.type === 'speech' ? '演讲' : '论文';
      refTexts.push(`【参考${typeLabel}】${row.title}\n${truncated}`);
    }

    // Build system prompt with references
    const fullSystem = [
      systemPrompt || '你是一个医药行业研究助手。根据用户提供的参考资料和指令，撰写专业、准确的内容。',
      ...(refTexts.length > 0
        ? ['\n\n--- 参考资料 ---\n' + refTexts.join('\n\n')]
        : []),
    ].join('\n');

    // Stream the response
    const config = getLLMConfig();

    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: fullSystem },
          ...messages,
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 8192,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: `LLM API error ${res.status}: ${text}` }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Forward the SSE stream directly
    return new Response(res.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
