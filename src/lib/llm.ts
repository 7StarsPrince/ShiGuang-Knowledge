import { ANALYSIS_SYSTEM_PROMPT, AnalysisResult } from './llm-prompt';
import fs from 'fs';
import path from 'path';

// Provider defaults (all OpenAI-compatible)
export const PROVIDERS: Record<string, { label: string; baseUrl: string; models: string[]; visionModel?: string }> = {
  glm: { label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4-flash', 'glm-4-plus', 'glm-4-long', 'glm-4v'], visionModel: 'glm-4v' },
  kimi: { label: 'Kimi Coding Plan', baseUrl: 'https://api.kimi.com/coding/v1', models: ['kimi-for-coding'], visionModel: 'kimi-k2-0711-preview' },
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', models: ['deepseek-chat', 'deepseek-reasoner'] },
  custom: { label: '自定义 (OpenAI兼容)', baseUrl: '', models: [] },
};

const CONFIG_PATH = path.join(process.cwd(), 'data', 'llm-config.json');

export interface LLMConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  visionModel?: string;
}

export type ChatMessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >;

export interface ChatMessage {
  role: string;
  content: ChatMessageContent;
}

export function getVisionModel(): string | null {
  const cfg = loadLLMConfig();
  if (cfg.visionModel) return cfg.visionModel;
  const defaults = PROVIDERS[cfg.provider];
  return defaults?.visionModel || null;
}
export function loadLLMConfig(): LLMConfig {
  // Priority: config file > env vars > defaults
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const cfg = JSON.parse(raw);
      if (cfg.apiKey) return cfg;
    }
  } catch {}

  const provider = process.env.LLM_PROVIDER || 'glm';
  const defaults = PROVIDERS[provider] || PROVIDERS.glm;
  return {
    provider,
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || defaults.baseUrl,
    model: process.env.LLM_MODEL || defaults.models[0],
    visionModel: process.env.LLM_VISION_MODEL || defaults.visionModel,
  };
}

export function saveLLMConfig(cfg: LLMConfig): void {
  // Fill defaults if provider is known
  const defaults = PROVIDERS[cfg.provider];
  if (defaults && !cfg.baseUrl) cfg.baseUrl = defaults.baseUrl;
  if (defaults && !cfg.model && defaults.models.length > 0) cfg.model = defaults.models[0];
  if (defaults && !cfg.visionModel && defaults.visionModel) cfg.visionModel = defaults.visionModel;

  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

export function getLLMConfig(): { baseUrl: string; apiKey: string; model: string } {
  const cfg = loadLLMConfig();
  return { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model };
}

export async function chat(
  messages: ChatMessage[],
  options?: { temperature?: number; max_tokens?: number; json_mode?: boolean; model?: string }
): Promise<string> {
  const config = getLLMConfig();
  if (!config.apiKey) throw new Error('LLM_API_KEY is not configured');

  const isKimiCoding = config.baseUrl.includes('api.kimi.com/coding');

  const body: Record<string, unknown> = {
    model: options?.model || config.model,
    messages,
    temperature: isKimiCoding ? 1 : (options?.temperature ?? 0.3),
    max_tokens: options?.max_tokens ?? 4096,
  };
  if (options?.json_mode) {
    body.response_format = { type: 'json_object' };
  }
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
      ...(isKimiCoding ? { 'User-Agent': 'claude-code/1.0' } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

export async function chatVision(
  textPrompt: string,
  imageBase64List: string[],
  options?: { temperature?: number; max_tokens?: number; json_mode?: boolean; model?: string }
): Promise<string> {
  const visionModel = options?.model || getVisionModel();
  if (!visionModel) throw new Error('未配置 vision 模型');

  const images = imageBase64List.map((b64) => ({
    type: 'image_url' as const,
    image_url: { url: `data:image/png;base64,${b64}` },
  }));

  return chat(
    [
      {
        role: 'user',
        content: [{ type: 'text' as const, text: textPrompt }, ...images],
      },
    ],
    { ...options, model: visionModel }
  );
}

const MAX_CONTENT_CHARS = 6000;

function truncateContent(title: string, text: string): string {
  const titleBudget = title.length + 10;
  const remaining = MAX_CONTENT_CHARS - titleBudget;
  if (remaining <= 0) return title.slice(0, MAX_CONTENT_CHARS);

  const cleanText = text
    .replace(/<[^>]+>/g, ' ')        // strip HTML
    .replace(/\s+/g, ' ')             // collapse whitespace
    .trim();

  if (cleanText.length <= remaining) return `标题：${title}\n\n内容：${cleanText}`;
  return `标题：${title}\n\n内容：${cleanText.slice(0, remaining)}`;
}

export async function analyzeContent(title: string, text: string): Promise<AnalysisResult> {
  const input = truncateContent(title, text || '');
  if (!input.trim()) {
    return { keywords: [], summary: '', entities: { companies: [], drugs: [], people: [], organizations: [], diseases: [], mechanisms: [] } };
  }

  const raw = await chat(
    [
      { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: input },
    ],
    { json_mode: true, temperature: 0.2 }
  );

  try {
    const parsed = JSON.parse(raw);
    return {
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      entities: {
        companies: Array.isArray(parsed.entities?.companies) ? parsed.entities.companies : [],
        drugs: Array.isArray(parsed.entities?.drugs) ? parsed.entities.drugs : [],
        people: Array.isArray(parsed.entities?.people) ? parsed.entities.people : [],
        organizations: Array.isArray(parsed.entities?.organizations) ? parsed.entities.organizations : [],
        diseases: Array.isArray(parsed.entities?.diseases) ? parsed.entities.diseases : [],
        mechanisms: Array.isArray(parsed.entities?.mechanisms) ? parsed.entities.mechanisms : [],
      },
    };
  } catch {
    console.error('Failed to parse LLM response as JSON:', raw.slice(0, 200));
    return { keywords: [], summary: '', entities: { companies: [], drugs: [], people: [], organizations: [], diseases: [], mechanisms: [] } };
  }
}
