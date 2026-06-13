import { NextRequest } from 'next/server';
import getDb from '@/lib/db';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');

type EnhanceMethod = 'deepfilternet' | 'demucs';

const METHOD_CONFIG: Record<EnhanceMethod, {
  script: string;
  dbColumn: string;
  outputFile: string;
  label: string;
}> = {
  deepfilternet: {
    script: 'enhance_audio.py',
    dbColumn: 'audio_enhanced_path',
    outputFile: 'audio_enhanced.wav',
    label: 'DeepFilterNet',
  },
  demucs: {
    script: 'enhance_audio_demucs.py',
    dbColumn: 'audio_enhanced_demucs_path',
    outputFile: 'audio_enhanced_demucs.wav',
    label: 'Demucs',
  },
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json().catch(() => ({}));
  const method: EnhanceMethod = body.method === 'demucs' ? 'demucs' : 'deepfilternet';
  const config = METHOD_CONFIG[method];

  const speech = db.prepare('SELECT * FROM speeches WHERE id = ?').get(id) as any;
  if (!speech) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  if (!speech.audio_path) return new Response(JSON.stringify({ error: 'No audio file' }), { status: 400 });

  // Delete old enhanced file if exists (allow re-processing)
  if (speech[config.dbColumn]) {
    const oldPath = path.join(process.cwd(), speech[config.dbColumn]);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    // Also clean up any leftover MP3 export from the same base name
    const mp3Path = oldPath.replace(/\.wav$/, '.mp3');
    if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path);
  }
  // Always ensure output path is clear (even if DB column was null)
  const ensureOutputPath = path.join(path.dirname(path.join(process.cwd(), speech.audio_path)), config.outputFile);
  if (fs.existsSync(ensureOutputPath)) fs.unlinkSync(ensureOutputPath);
  const ensureOutputMp3 = ensureOutputPath.replace(/\.wav$/, '.mp3');
  if (fs.existsSync(ensureOutputMp3)) fs.unlinkSync(ensureOutputMp3);

  const inputPath = path.join(process.cwd(), speech.audio_path);
  if (!fs.existsSync(inputPath)) return new Response(JSON.stringify({ error: 'Audio file missing on disk' }), { status: 400 });

  const dir = path.dirname(inputPath);
  const outputPath = path.join(dir, config.outputFile);
  const relativeOutput = path.relative(process.cwd(), outputPath).replace(/\\/g, '/');
  const scriptPath = path.join(SCRIPTS_DIR, config.script);
  const passes = method === 'demucs' ? (body.passes || 1) : 1;
  const scriptArgs = method === 'demucs'
    ? [scriptPath, inputPath, outputPath, String(passes)]
    : [scriptPath, inputPath, outputPath];

  // SSE stream for progress
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const proc = spawn('python3', scriptArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60 * 60 * 1000,
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

          send('progress', { pct, method, message: trimmed.replace(`PROGRESS:${pctStr} `, ''), elapsed: Math.round(elapsed), remaining });
        }
      });

      let stderr = '';
      proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          db.prepare(`UPDATE speeches SET ${config.dbColumn} = ? WHERE id = ?`).run(relativeOutput, id);
          // For demucs, also store passes count and clear old whisper transcript
          if (method === 'demucs') {
            db.prepare('UPDATE speeches SET demucs_passes = ?, transcript_demucs_json = NULL WHERE id = ?').run(passes, id);
          }
          send('done', { enhancedPath: relativeOutput, method, dbColumn: config.dbColumn, passes: method === 'demucs' ? passes : undefined });
        } else {
          send('error', { error: `处理失败: ${stderr.slice(-300)}` });
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

  const speech = db.prepare('SELECT * FROM speeches WHERE id = ?').get(id) as any;
  if (!speech) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

  const body = await req.json().catch(() => ({}));
  const method: EnhanceMethod = body.method === 'demucs' ? 'demucs' : 'deepfilternet';
  const config = METHOD_CONFIG[method];

  if (speech[config.dbColumn]) {
    const fullPath = path.join(process.cwd(), speech[config.dbColumn]);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    db.prepare(`UPDATE speeches SET ${config.dbColumn} = NULL WHERE id = ?`).run(id);
  }

  return new Response(JSON.stringify({ ok: true }));
}
