import { getLlmConfig, openAiChatCompletionsPath, type LlmConfig } from '../../config/llm.config';

export interface OpenAiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAiChatCompletionsBody {
  messages: OpenAiChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
}

/** OpenAI Chat Completions (browser direct or Vite dev proxy). */
export async function openAIChatCompletion(
  body: OpenAiChatCompletionsBody,
  config: LlmConfig = getLlmConfig(),
): Promise<string> {
  const url = openAiChatCompletionsPath(config);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (!config.openai.useProxy) {
    headers.Authorization = `Bearer ${config.openai.apiKey}`;
  }

  const basePayload: Record<string, unknown> = {
    model: config.openai.model,
    messages: body.messages,
    temperature: body.temperature ?? 0.2,
    max_tokens: body.max_tokens ?? 500,
  };
  if (body.response_format) {
    basePayload.response_format = body.response_format;
  }

  const tryPayloads: Record<string, unknown>[] = [
    { ...basePayload, response_format: { type: 'json_object' } },
    { ...basePayload },
  ];

  let res: Response | null = null;
  let lastErr = '';
  for (const payload of tryPayloads) {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (res.ok) break;
    lastErr = await res.text().catch(() => res!.statusText);
    if (res.status === 400 && 'response_format' in payload) continue;
    throw new Error(`OpenAI error ${res.status}: ${lastErr.slice(0, 500)}`);
  }

  if (!res?.ok) {
    throw new Error(`OpenAI error: ${lastErr.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (data.error?.message) {
    throw new Error(data.error.message);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }
  return content;
}
