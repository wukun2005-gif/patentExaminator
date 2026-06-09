import type { ProviderId } from "@shared/types/agents";
import type { ProviderAdapter, ChatRequest, ChatResponse, ToolCall } from "./ProviderAdapter.js";
import { resolveMaxTokens, learnThinkingCapability } from "./ProviderAdapter.js";
import { getModelCapabilities } from "./model-capabilities-registry.js";
import { logger } from "../lib/logger.js";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

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
  /\baudio\b/i, /\bspeech\b/i, /\basr\b/i, /\btts\b/i,
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
    const url = `${GEMINI_BASE_URL}/models`;
    const res = await fetch(url, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(30_000),
    });

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
    const base = req.baseUrl ?? GEMINI_BASE_URL;
    const url = `${base}/models/${req.modelId}:generateContent`;

    const maskedKey = req.apiKey ? `${req.apiKey.slice(0, 6)}...${req.apiKey.slice(-4)}` : "none";
    const _now = new Date();
    const _pad2 = (n: number) => n < 10 ? `0${n}` : String(n);
    const reqTimestamp = `${_now.getFullYear()}-${_pad2(_now.getMonth() + 1)}-${_pad2(_now.getDate())} ${_pad2(_now.getHours())}:${_pad2(_now.getMinutes())}:${_pad2(_now.getSeconds())}.${String(_now.getMilliseconds()).padStart(3, "0")}`;
    const effectiveMaxTokens = resolveMaxTokens(req.modelId, req.maxTokens);
    console.log(`[GEMINI-DEBUG] ──── REQUEST START ──── ${reqTimestamp}`);
    console.log(`[GEMINI-DEBUG] provider=gemini url=${url}`);
    console.log(`[GEMINI-DEBUG] model=${req.modelId} maxTokens=${effectiveMaxTokens} temp=${req.temperature ?? 0.7}`);
    console.log(`[GEMINI-DEBUG] apiKey=${maskedKey} messages=${req.messages.length}`);
    console.log(`[GEMINI-DEBUG] signal=${req.signal ? "set" : "none"} signal.aborted=${req.signal?.aborted ?? "n/a"}`);
    const reqStartMs = Date.now();

    const contents = req.messages
      .filter(m => m.role !== "system")
      .map(m => {
        // NF1: tool response messages → functionResponse parts
        if (m.role === "tool" && m.tool_call_id) {
          return {
            role: "user" as const,
            parts: [{
              functionResponse: {
                name: m.tool_call_id.replace(/^call_\w+_/, ""), // extract function name from tool_call_id
                response: { content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) },
              }
            }]
          };
        }
        return {
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
        };
      });

    const systemInstruction = req.messages.find(m => m.role === "system");

    // D2: temperature 自适应
    const caps = getModelCapabilities(req.modelId);
    let temperature = req.temperature;
    if (!caps.temperature.supported) {
      temperature = undefined;
    } else if (temperature !== undefined) {
      const [min, max] = caps.temperature.range;
      temperature = Math.max(min, Math.min(max, temperature));
    }

    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: resolveMaxTokens(req.modelId, req.maxTokens)
    };
    if (temperature !== undefined) {
      generationConfig.temperature = temperature;
    }

    // D4: structured output — Gemini 用 responseMimeType + responseSchema
    if (req.responseFormat && caps.supportsStructuredOutput) {
      generationConfig.responseMimeType = "application/json";
      generationConfig.responseSchema = req.responseFormat.json_schema.schema;
    }

    const body: Record<string, unknown> = {
      contents,
      generationConfig
    };

    // NF1: convert OpenAI-style tools to Gemini functionDeclarations format
    if (req.tools && req.tools.length > 0) {
      body.tools = [{
        functionDeclarations: req.tools.map(t => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        }))
      }];
    }

    if (systemInstruction) {
      const sysContent = systemInstruction.content;
      body.systemInstruction = {
        parts: Array.isArray(sysContent)
          ? sysContent.map(part => part.type === "text" && part.text != null ? { text: part.text } : { text: "" })
          : [{ text: sysContent }]
      };
    }

    // Single attempt — retry logic is handled by ProviderRegistry
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": req.apiKey
        },
        body: JSON.stringify(body),
        signal: req.signal ?? null
      });
    } catch (fetchErr) {
      const elapsed = Date.now() - reqStartMs;
      const errName = fetchErr instanceof Error ? fetchErr.name : "unknown";
      const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      const errCode = (fetchErr as NodeJS.ErrnoException)?.code ?? "none";
      const errCause = fetchErr instanceof Error && fetchErr.cause
        ? `cause={name=${(fetchErr.cause as Error)?.name} message=${(fetchErr.cause as Error)?.message} code=${(fetchErr.cause as NodeJS.ErrnoException)?.code}}`
        : "cause=none";
      console.log(`[GEMINI-DEBUG] ──── FETCH ERROR ──── elapsed=${elapsed}ms`);
      console.log(`[GEMINI-DEBUG] name=${errName} code=${errCode} message=${errMsg}`);
      console.log(`[GEMINI-DEBUG] ${errCause}`);
      console.log(`[GEMINI-DEBUG] stack=${fetchErr instanceof Error ? fetchErr.stack?.split("\n").slice(0, 5).join(" | ") : "no stack"}`);
      throw fetchErr;
    }

    const elapsed = Date.now() - reqStartMs;
    console.log(`[GEMINI-DEBUG] ──── RESPONSE ──── elapsed=${elapsed}ms`);
    console.log(`[GEMINI-DEBUG] status=${res.status} statusText=${res.statusText}`);
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { resHeaders[k] = v; });
    console.log(`[GEMINI-DEBUG] responseHeaders=${JSON.stringify(resHeaders)}`);

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      console.log(`[GEMINI-DEBUG] ──── HTTP ERROR ──── status=${res.status} body=${errorBody.slice(0, 500)}`);
      const error = new Error(`Gemini API error ${res.status}: ${errorBody}`);
      (error as Error & { status: number }).status = res.status;
      throw error;
    }

    const data = await res.json() as {
      candidates: Array<{ content: { parts: Array<{ text?: string; thought?: boolean; functionCall?: { name: string; args: Record<string, unknown> } }> } }>;
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number; thoughtsTokenCount?: number };
      promptFeedback?: unknown;
    };

    // D1: 从所有 parts 中跳过 thought parts，只取非 thought 的 text
    const allParts = data.candidates?.[0]?.content?.parts ?? [];
    const textParts = allParts.filter((p) => p.text != null && !p.thought);
    const text = textParts.map((p) => p.text!).join("") ?? "";

    // NF1: extract functionCall parts as tool calls
    let toolCalls: ToolCall[] | undefined;
    const functionCallParts = allParts.filter((p) => p.functionCall != null);
    if (functionCallParts.length > 0) {
      toolCalls = functionCallParts.map((p, i) => ({
        id: `call_gemini_${i}`,
        type: "function" as const,
        function: {
          name: p.functionCall!.name,
          arguments: JSON.stringify(p.functionCall!.args ?? {}),
        },
      }));
    }

    const totalElapsed = Date.now() - reqStartMs;
    const thinkingTokens = data.usageMetadata?.thoughtsTokenCount ?? 0;
    learnThinkingCapability(req.modelId, thinkingTokens);
    console.log(`[GEMINI-DEBUG] ──── SUCCESS ──── totalElapsed=${totalElapsed}ms`);
    console.log(`[GEMINI-DEBUG] usage=${data.usageMetadata ? JSON.stringify(data.usageMetadata) : "none"}`);
    console.log(`[GEMINI-DEBUG] textLen=${text.length} candidates=${data.candidates?.length ?? 0} thinkingTokens=${thinkingTokens}`);
    console.log(`[GEMINI-DEBUG] ──── REQUEST END ────`);

    if (!text) {
      logger.warn("Gemini returned empty response", {
        model: req.modelId,
        hasCandidates: !!data.candidates,
        candidateCount: data.candidates?.length ?? 0,
        hasPromptFeedback: !!data.promptFeedback,
        rawKeys: Object.keys(data)
      });
    }
    const usage = data.usageMetadata
      ? {
          input: data.usageMetadata.promptTokenCount,
          output: data.usageMetadata.candidatesTokenCount,
          total: data.usageMetadata.promptTokenCount + data.usageMetadata.candidatesTokenCount
        }
      : undefined;

    const resp: ChatResponse = {
      text,
      rawResponse: data,
    };
    if (usage) resp.tokenUsage = usage;
    if (thinkingTokens > 0) resp.thinkingTokens = thinkingTokens;
    if (toolCalls) resp.toolCalls = toolCalls;
    return resp;
  }
}
