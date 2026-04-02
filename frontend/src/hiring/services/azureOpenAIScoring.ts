import { azureOpenAiChatCompletionsPath, getLlmConfig, type LlmConfig } from '../../config/llm.config';

export interface AzureChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AzureChatCompletionsBody {
  messages: AzureChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
}

/**
 * Calls Azure OpenAI chat completions (same API shape as OpenAI).
 * URL and auth depend on llm.config (browser direct vs Vite dev proxy).
 */
export async function azureOpenAIChatCompletion(
  body: AzureChatCompletionsBody,
  config: LlmConfig = getLlmConfig(),
): Promise<string> {
  const url = azureOpenAiChatCompletionsPath(config);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (!config.azure.useProxy) {
    headers['api-key'] = config.azure.apiKey;
  }

  const basePayload: AzureChatCompletionsBody = {
    ...body,
    temperature: body.temperature ?? 0.2,
    max_tokens: body.max_tokens ?? 500,
  };

  const tryPayloads: AzureChatCompletionsBody[] = [
    { ...basePayload, response_format: { type: 'json_object' } },
    basePayload,
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
    if (res.status === 400 && payload.response_format) continue;
    throw new Error(`Azure OpenAI error ${res.status}: ${lastErr.slice(0, 500)}`);
  }

  if (!res?.ok) {
    throw new Error(`Azure OpenAI error: ${lastErr.slice(0, 500)}`);
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
    throw new Error('Empty response from Azure OpenAI');
  }
  return content;
}
