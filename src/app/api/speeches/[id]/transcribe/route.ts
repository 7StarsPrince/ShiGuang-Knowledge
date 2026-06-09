import { NextRequest } from 'next/server';
import getDb from '@/lib/db';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json().catch(() => ({}));
  const audioSource: 'original' | 'demucs' = body.audioSource || 'original';
  const model: string = body.model || 'medium';

  const speech = db.prepare('SELECT * FROM speeches WHERE id = ?').get(id) as any;
  if (!speech) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

  // Pick audio source
  const audioPath = audioSource === 'demucs' ? speech.audio_enhanced_demucs_path : speech.audio_path;
  if (!audioPath) {
    return new Response(JSON.stringify({ error: audioSource === 'demucs' ? '请先完成人声分离' : '无音频文件' }), { status: 400 });
  }

  const inputPath = path.join(process.cwd(), audioPath);
  if (!fs.existsSync(inputPath)) {
    return new Response(JSON.stringify({ error: '音频文件不存在' }), { status: 400 });
  }

  const dir = path.dirname(inputPath);
  const suffix = audioSource === 'demucs' ? 'demucs' : 'original';
  const outputPath = path.join(dir, `transcript_whisper_${suffix}.json`);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const proc = spawn('python3', [
        path.join(SCRIPTS_DIR, 'transcribe_whisper.py'),
        inputPath,
        outputPath,
        model,
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30 * 60 * 1000,
      });

      const startTime = Date.now();

      proc.stdout.on('data', (data: Buffer) => {
        for (const line of data.toString().split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('PROGRESS:')) continue;
          const pctStr = trimmed.replace('PROGRESS:', '').split(' ')[0];
          const pct = parseInt(pctStr, 10);
          if (isNaN(pct)) continue;

          const elapsed = (Date.now() - startTime) / 1000;
          const remaining = pct > 0 ? Math.round(elapsed / pct * (100 - pct)) : 0;

          send('progress', { pct, message: trimmed.replace(`PROGRESS:${pctStr} `, ''), remaining });
        }
      });

      let stderr = '';
      proc.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        // Parse tqdm progress bar from stderr (e.g., "  45%|████▌     | 90000/198043")
        for (const line of text.split('\n')) {
          const m = line.match(/(\d+)%\|/);
          if (m) {
            const tqdmPct = parseInt(m[1], 10);
            // Map tqdm 0-100% to our 20-85% range
            const pct = Math.round(20 + (tqdmPct / 100) * 65);
            if (pct > 0) {
              const elapsed = (Date.now() - startTime) / 1000;
              const remaining = pct > 20 ? Math.round((elapsed / (pct - 20)) * (85 - pct)) : 0;
              send('progress', { pct, message: `Transcribing... ${tqdmPct}%`, remaining });
            }
          }
        }
      });

      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          const json = fs.readFileSync(outputPath, 'utf-8');
          db.prepare('UPDATE speeches SET transcript_demucs_json = ? WHERE id = ?').run(json, id);
          send('done', { ok: true });
        } else {
          send('error', { error: `转写失败: ${stderr.slice(-500)}` });
        }
        controller.close();
      });

      proc.on('error', (err) => {
        send('error', { error: err.message });
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();

  db.prepare('UPDATE speeches SET transcript_demucs_json = NULL WHERE id = ?').run(id);

  return new Response(JSON.stringify({ ok: true }));
}
