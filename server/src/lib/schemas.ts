import { z } from "zod";

export const aiRunRequestSchema = z.object({
  agent: z.enum(["interpret", "claim-chart", "novelty", "inventive", "summary", "draft", "chat", "defects", "search-references", "extract-case-fields", "opinion-analysis", "argument-analysis", "reexam-draft", "translate"]),
  providerPreference: z.array(z.string()).min(1),
  modelId: z.string().min(1),
  reasoningLevel: z.enum(["low", "medium", "high"]).optional(),
  prompt: z.string().min(1),
  expectedSchemaName: z.string().optional(),
  sanitized: z.boolean(),
  mock: z.boolean().optional(),
  metadata: z.object({
    caseId: z.string(),
    moduleScope: z.string(),
    tokenEstimate: z.number().nonnegative()
  })
});

export const settingsUpdateSchema = z.object({
  providers: z
    .array(
      z.object({
        providerId: z.string(),
        baseUrl: z.string().optional(),
        apiKey: z.string().optional(),
        enabled: z.boolean()
      })
    )
    .optional()
});
