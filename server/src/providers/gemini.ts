import type { ProviderId } from "@shared/types/agents";
import type { ProviderAdapter, ChatRequest, ChatResponse } from "./ProviderAdapter.js";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MAX_RETRIES = 3;
const GEMINI_BASE_RETRY_DELAY_MS = 2000;

const DEFAULT_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-pro"
];

// 排除：图片、音频、视频、嵌入、TTS等非文本模型
const NON_TEXT_PATTERNS = [
  /\bimagen\b/i, /\bnano\s*banana\b/i,
  /\baudio\b/i, /\bspeech\b/i, /\btts\b/i,
  /\bembedding\b/i, /\bembed\b/i,
  /\bveo\b/i, /\bvideo\b/i, /\blyria\b/i, /\bmusic\b/i,
  /\bclip\b/i, /\bupscale\b/i, /\brecontext\b/i,
  /\btranscrib/i, /\bcomputer[- ]?use\b/i,
];

// 排除：实验性/特殊用途模型
const NOISY_PATTERNS = [
  /\bdeep[- ]?research\b/i,
  /\brobotics\b/i,
  /\bcustom\s*tools?\b/i,
  /\blatest\b/i,
  /-001$/i,
];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableError(status: number): boolean {
  return status === 429 || status === 503 || status >= 500;
}

function isQuotaError(status: number): boolean {
  return status === 429;
}

interface GeminiModel {
  name: string;
  displayName?: string;
  description?: string;
  supportedGenerationMethods?: string[];
  supportedActions?: string[];
  inputTokenLimit?: number;
  outputTokenLimit?: number;
}

function getModelId(model: GeminiModel): string {
  return (model.name || "").replace("models/", "");
}

function getSearchText(model: GeminiModel): string {
  return [getModelId(model), model.displayName, model.description].filter(Boolean).join(" ");
}

function isTextModel(model: GeminiModel): boolean {
  const methods = model.supportedGenerationMethods || model.supportedActions || [];
  const supportsGenerate = methods.some(m => {
    const n = String(m).toLowerCase();
    return n === "generatecontent" || n === "streamgeneratecontent";
  });
  if (!supportsGenerate) return false;

  const id = getModelId(model);
  const text = getSearchText(model);

  if (!/^gemini-/i.test(id)) return false;
  if (NON_TEXT_PATTERNS.some(p => p.test(text))) return false;
  if (NOISY_PATTERNS.some(p => p.test(id) || p.test(text))) return false;

  return true;
}

export class GeminiAdapter implements ProviderAdapter {
  id: ProviderId = "gemini";
  defaultBaseUrl = GEMINI_BASE_URL;

  supportedModels(): string[] {
    return DEFAULT_MODELS;
  }

  async listModels(apiKey: string): Promise<string[]> {
    const url = `${GEMINI_BASE_URL}/models?key=${apiKey}`;
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Failed to list Gemini models: ${res.status} ${body}`);
    }

    const data = await res.json() as { models: GeminiModel[] };
    const models = data.models
      .filter(isTextModel)
      .map(m => getModelId(m))
      .sort();

    return models;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const url = `${GEMINI_BASE_URL}/models/${req.modelId}:generateContent?key=${req.apiKey}`;

    const contents = req.messages
      .filter(m => m.role !== "system")
      .map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: Array.isArray(m.content)
          ? m.content.map(part => {
              if (part.type === "text" && part.text != null) {
                return { text: part.text };
              }
              if (part.type === "inline_data" && part.inline_data != null) {
                return {
                  inlineData: {
                    mimeType: part.inline_data.mimeType,
                    data: part.inline_data.data
                  }
                };
              }
              if (part.type === "image_url" && part.image_url != null) {
                return {
                  fileData: {
                    mimeType: "image/png",
                    fileUri: part.image_url.url
                  }
                };
              }
              return { text: "" };
            })
          : [{ text: m.content }]
      }));

    const systemInstruction = req.messages.find(m => m.role === "system");

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: req.temperature ?? 0.7,
        maxOutputTokens: req.maxTokens ?? 4096
      }
    };

    if (systemInstruction) {
      const sysContent = systemInstruction.content;
      body.systemInstruction = {
        parts: Array.isArray(sysContent)
          ? sysContent.map(part => part.type === "text" && part.text != null ? { text: part.text } : { text: "" })
          : [{ text: sysContent }]
      };
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await sleep(GEMINI_BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1));
      }

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: req.signal ?? null
        });

        if (!res.ok) {
          const errorBody = await res.text().catch(() => "");
          const error = new Error(`Gemini API error ${res.status}: ${errorBody}`);
          (error as Error & { status: number }).status = res.status;

          if (attempt < GEMINI_MAX_RETRIES && isRetryableError(res.status)) {
            if (isQuotaError(res.status)) {
              throw error;
            }
            continue;
          }

          throw error;
        }

        const data = await res.json() as {
          candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
          usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
        };

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        const usage = data.usageMetadata
          ? {
              input: data.usageMetadata.promptTokenCount,
              output: data.usageMetadata.candidatesTokenCount,
              total: data.usageMetadata.promptTokenCount + data.usageMetadata.candidatesTokenCount
            }
          : undefined;

        return {
          text,
          ...(usage ? { tokenUsage: usage } : {}),
          rawResponse: data
        };
      } catch (error) {
        lastError = error;
        const status = (error as Error & { status?: number }).status;

        if (status === 401 || status === 403) {
          throw error;
        }

        if (status && isQuotaError(status)) {
          throw error;
        }
      }
    }

    throw lastError;
  }
}
