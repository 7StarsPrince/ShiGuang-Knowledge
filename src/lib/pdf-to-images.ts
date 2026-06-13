import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const SCRIPT_PATH = path.join(process.cwd(), 'scripts', 'render-pdf-pages.py');

export async function renderPdfPagesToBase64(
  pdfBuffer: Buffer,
  pageIndices: number[] = [0, 1],
  dpi = 150
): Promise<string[]> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-render-'));
  const tmpPdf = path.join(tmpDir, 'input.pdf');
  fs.writeFileSync(tmpPdf, pdfBuffer);

  try {
    const outputDir = path.join(tmpDir, 'pages');
    const result = await runPython(SCRIPT_PATH, [tmpPdf, outputDir, JSON.stringify(pageIndices), String(dpi)]);

    let paths: string[];
    try {
      const parsed = JSON.parse(result);
      if (Array.isArray(parsed)) {
        paths = parsed;
      } else if (parsed.error) {
        throw new Error(parsed.error);
      } else {
        throw new Error('Unexpected output from PDF renderer');
      }
    } catch {
      throw new Error(`PDF render failed: ${result}`);
    }

    if (paths.length === 0) {
      throw new Error('No pages rendered');
    }

    return paths.map((p) => {
      const data = fs.readFileSync(p);
      return data.toString('base64');
    });
  } finally {
    // Clean up temp files
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

function runPython(script: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [script, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Python process exited with code ${code}`));
      } else {
        resolve(stdout.trim());
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to run python3: ${err.message}`));
    });
  });
}
