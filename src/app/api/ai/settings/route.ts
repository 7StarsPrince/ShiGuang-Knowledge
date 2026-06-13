import { NextRequest, NextResponse } from 'next/server';
import { loadLLMConfig, saveLLMConfig, PROVIDERS } from '@/lib/llm';

export async function GET() {
  try {
    const cfg = loadLLMConfig();
    // Mask API key for display
    const masked = cfg.apiKey
      ? cfg.apiKey.slice(0, 6) + '***' + cfg.apiKey.slice(-4)
      : '';
    return NextResponse.json({
      config: { ...cfg, apiKey: masked, hasKey: !!cfg.apiKey },
      providers: Object.fromEntries(
        Object.entries(PROVIDERS).map(([k, v]) => [k, { label: v.label, baseUrl: v.baseUrl, models: v.models }])
      ),
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { provider, apiKey, baseUrl, model } = body;

    if (!provider) return NextResponse.json({ error: 'Provider is required' }, { status: 400 });

    // If apiKey contains '***', keep the existing one
    const current = loadLLMConfig();
    const finalKey = apiKey?.includes('***') ? current.apiKey : (apiKey || '');

    if (!finalKey) return NextResponse.json({ error: 'API Key is required' }, { status: 400 });

    saveLLMConfig({ provider, apiKey: finalKey, baseUrl: baseUrl || '', model: model || '' });

    return NextResponse.json({ ok: true, message: 'Settings saved' });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
