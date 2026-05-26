// AWS Bedrock Provider - OpenAI-compatible API
// Reference: https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages.html

import type { ProviderId } from "@shared/types/agents";
import type { ProviderAdapter, ChatRequest, ChatResponse } from "./ProviderAdapter.js";

const BEDROCK_OPENAI_COMPAT_BASE_URL = "https://bedrock-mantle.us-east-1.api.aws/v1";

// Common Bedrock model IDs (user can configure custom models too)
const DEFAULT_MODELS = [
  "anthropic.claude-3-5-sonnet-20241022-v2:0",
  "anthropic.claude-3-5-haiku-20241022-v1:0",
  "anthropic.claude-3-sonnet-20240229-v1:0",
  "anthropic.claude-3-haiku-20240307-v1:0",
  "meta.llama3-2-3b-instruct-v1:0",
  "meta.llama3-2-1b-instruct-v1:0",
];

export class BedrockAdapter implements ProviderAdapter {
  id: ProviderId = "bedrock";
  defaultBaseUrl = BEDROCK_OPENAI_COMPAT_BASE_URL;
  private baseUrl: string;

  constructor() {
    this.baseUrl = BEDROCK_OPENAI_COMPAT_BASE_URL;
  }

  supportedModels(): string[] {
    return DEFAULT_MODELS;
  }

  async listModels(apiKey: string): Promise<string[]> {
    // Bedrock OpenAI-compatible API uses /models endpoint
    const url = `${this.baseUrl}/models`;
    
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      }
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Failed to list Bedrock models: ${res.status} ${body}`);
    }

    const data = await res.json() as { data?: Array<{ id: string }>; models?: Array<{ id: string }> };
    // OpenAI-compatible format: { data: [{ id: "model-id" }] }
    const models = data.data ?? data.models ?? [];
    return models.map(m => m.id).filter(Boolean);
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const url = `${req.baseUrl ?? this.baseUrl}/chat/completions`;

    // Build OpenAI-compatible request body
    const body = {
      model: req.modelId,
      messages: req.messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 4096,
      stream: false
    };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${req.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: req.signal ?? null
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "");
        const error = new Error(`Bedrock API error ${res.status}: ${errorBody}`);
        (error as Error & { status: number }).status = res.status;
        throw error;
      }

      const data = await res.json() as {
        choices: Array<{
          message: { content: string };
          finish_reason?: string;
        }>;
        usage?: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        };
      };

      const text = data.choices?.[0]?.message?.content ?? "";
      const usage = data.usage
        ? {
            input: data.usage.prompt_tokens,
            output: data.usage.completion_tokens,
            total: data.usage.total_tokens
          }
        : undefined;

      return {
        text,
        ...(usage ? { tokenUsage: usage } : {}),
        rawResponse: data
      };
    } catch (error) {
      // Re-throw with status if it's a fetch error
      if (error instanceof Error && !(error as Error & { status?: number }).status) {
        const statusMatch = error.message.match(/HTTP\s*(\d+)/);
        if (statusMatch) {
          (error as Error & { status: number }).status = parseInt(statusMatch[1]!, 10);
        }
      }
      throw error;
    }
  }
}
