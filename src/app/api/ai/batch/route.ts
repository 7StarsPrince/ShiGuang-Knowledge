import { NextRequest } from 'next/server';
import { analyzeAndStore, getAllUnanalyzed, ContentType } from '@/lib/ai-helpers';

const BATCH_DELAY_MS = 500;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contentType, contentIds } = body as {
      contentType?: ContentType | 'all';
      contentIds?: number[];
    };

    const items = contentIds
      ? (contentType && contentType !== 'all'
          ? contentIds.map(id => ({ type: contentType as ContentType, id, title: '' }))
          : contentIds.map(id => ({ type: 'article' as ContentType, id, title: '' })))
      : getAllUnanalyzed(contentType === 'all' ? undefined : contentType as ContentType);

    if (items.length === 0) {
      return new Response(JSON.stringify({ processed: 0, failed: 0, message: 'No items to analyze' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let processed = 0;
        let failed = 0;

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          try {
            controller.enqueue(encoder.encode(
              `event: progress\ndata: ${JSON.stringify({ current: i + 1, total: items.length, type: item.type, id: item.id, title: item.title })}\n\n`
            ));

            await analyzeAndStore(item.type, item.id);
            processed++;
          } catch (err: any) {
            failed++;
            controller.enqueue(encoder.encode(
              `event: error\ndata: ${JSON.stringify({ type: item.type, id: item.id, error: err.message })}\n\n`
            ));
          }

          if (i < items.length - 1) {
            await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
          }
        }

        controller.enqueue(encoder.encode(
          `event: done\ndata: ${JSON.stringify({ processed, failed })}\n\n`
        ));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
