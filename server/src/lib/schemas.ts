import { z } from "zod";

export const aiRunRequestSchema = z.object({
  agent: z.enum(["interpret", "claim-chart", "novelty", "inventive", "summary", "chat", "defects", "search-references", "extract-case-fields", "opinion-analysis", "argument-analysis", "reexam-draft", "translate", "classify-documents"]),
  providerPreference: z.array(z.string()).min(1),
  modelId: z.string().min(1),
  maxTokens: z.number().int().positive().optional(),
  modelFallbacks: z.record(z.string(), z.array(z.string())).optional(),
  enableModelFallback: z.record(z.string(), z.boolean()).optional(),
  providerBaseUrls: z.record(z.string(), z.string()).optional(),
  reasoningLevel: z.enum(["low", "medium", "high"]).optional(),
  prompt: z.string().min(1),
  apiKey: z.string().optional(),
  expectedSchemaName: z.string().optional(),
  sanitized: z.boolean(),
  mock: z.boolean().optional(),
  metadata: z.object({
    caseId: z.string(),
    moduleScope: z.string(),
    tokenEstimate: z.number().nonnegative(),
    mockKey: z.string().optional()
  })
});

// B-030: settingsUpdateSchema 已删除（从未被引用）
