import { NextRequest } from 'next/server';
import getDb from '@/lib/db';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  const speech = db.prepare('SELECT * FROM speeches WHERE id = ?').get(id) as any;
  if (!speech) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

  const body = await req.json().catch(() => ({}));
  const source: 'demucs' | 'original' = body.source === 'demucs' ? 'demucs' : 'demucs';

  const inputPath = source === 'demucs'
    ? speech.audio_enhanced_demucs_path
    : speech.audio_path;

  if (!inputPath) {
    return new Response(JSON.stringify({ error: 'No enhanced audio found' }), { status: 400 });
  }

  const fullInputPath = path.join(process.cwd(), inputPath);
  if (!fs.existsSync(fullInputPath)) {
    return new Response(JSON.stringify({ error: 'Audio file missing on disk' }), { status: 400 });
  }

  // Output MP3 path
  const outputFileName = path.basename(fullInputPath, path.extname(fullInputPath)) + '.mp3';
  const outputDir = path.dirname(fullInputPath);
  const outputPath = path.join(outputDir, outputFileName);

  // Convert WAV to MP3 using Python (soundfile + lameenc)
  const scriptPath = path.join(process.cwd(), 'scripts', 'convert_to_mp3.py');

  return new Promise<Response>((resolve) => {
    const proc = spawn('python3', [scriptPath, fullInputPath, outputPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5 * 60 * 1000,
    });

    let stderr = '';
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve(new Response(JSON.stringify({ error: `转换失败: ${stderr.slice(-200)}` }), { status: 500 }));
        return;
      }

      if (!fs.existsSync(outputPath)) {
        resolve(new Response(JSON.stringify({ error: 'MP3 文件未生成' }), { status: 500 }));
        return;
      }

      const mp3Data = fs.readFileSync(outputPath);
      const title = speech.title || 'audio';
      const safeName = title.replace(/[/\\?%*:|"<>]/g, '_');

      resolve(new Response(mp3Data, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeName + '.mp3')}`,
          'Content-Length': String(mp3Data.length),
        },
      }));

      // Clean up temp MP3
      setTimeout(() => {
        try { fs.unlinkSync(outputPath); } catch {}
      }, 5000);
    });

    proc.on('error', (err) => {
      resolve(new Response(JSON.stringify({ error: err.message }), { status: 500 }));
    });
  });
}
