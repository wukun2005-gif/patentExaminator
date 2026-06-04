/**
 * Zod schemas for API endpoint input validation (BUG-042)
 */
import { z } from "zod";

// ── POST /api/agent/run ──────────────────────────────────────
export const agentRunInputSchema = z.object({
  agent: z.enum([
    "interpret", "claim-chart", "novelty", "inventive", "summary", "chat",
    "defects", "extract-case-fields", "opinion-analysis",
    "argument-analysis", "reexam-draft", "translate", "classify-documents"
  ]),
  caseId: z.string().min(1, "caseId is required"),
  request: z.record(z.unknown()).default({}),
  providerPreference: z.array(z.string()).optional(),
  modelId: z.string().optional(),
  modelFallbacks: z.record(z.array(z.string())).optional(),
  enableModelFallback: z.record(z.boolean()).optional(),
  providerBaseUrls: z.record(z.string()).optional(),
  maxTokens: z.number().int().positive().optional(),
  knowledgeEnabled: z.boolean().optional(),
  apiKey: z.string().optional(),
  mock: z.boolean().optional(),
  mockKey: z.string().optional(),
});

// ── POST /api/knowledge/import-url ───────────────────────────
export const knowledgeImportUrlInputSchema = z.object({
  url: z.string().url("Invalid URL format"),
});

// ── POST /api/knowledge/search ───────────────────────────────
const providerConfigSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  modelId: z.string().min(1),
});

export const knowledgeSearchInputSchema = z.object({
  query: z.string().min(1, "query is required"),
  topK: z.number().int().positive().max(100).default(5),
  reranker: providerConfigSchema.optional(),
  embedding: providerConfigSchema.optional(),
});

// ── POST /api/knowledge/providers/test ───────────────────────
export const knowledgeProviderTestInputSchema = z.object({
  providerType: z.enum(["embedding", "reranker"]),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  modelId: z.string().min(1),
});

// ── POST /api/sync/upload ────────────────────────────────────
export const syncUploadInputSchema = z.object({
  stores: z.record(z.array(z.object({
    id: z.string(),
    data: z.unknown().transform(v => v ?? null),
  }))),
});

// ── POST /api/data/:store/query ──────────────────────────────
export const dataQueryInputSchema = z.object({
  field: z.string().min(1, "field is required"),
  value: z.unknown(),
});

// ── POST /api/data/:store ────────────────────────────────────
export const dataCreateInputSchema = z.object({
  id: z.string().min(1, "id is required"),
}).passthrough();

// ── PUT /api/settings/providers/:id ──────────────────────────
export const settingsProviderInputSchema = z.object({
  apiKey: z.string().min(1, "apiKey is required"),
});

// ── GET /api/providers/:id/models (query params) ─────────────
export const settingsModelsQuerySchema = z.object({
  apiKey: z.string().min(1, "apiKey is required").max(2048, "apiKey too long"),
  baseUrl: z.string().url("Invalid baseUrl format").max(2048, "baseUrl too long").optional(),
});

// ── POST /api/documents/extract-html ─────────────────────────
export const documentsExtractHtmlInputSchema = z.object({
  html: z.string().min(1, "html is required"),
});

// ── POST /api/documents/parse-claims ─────────────────────────
export const documentsParseClaimsInputSchema = z.object({
  text: z.string().min(1, "text is required"),
  caseId: z.string().min(1, "caseId is required"),
});

// ── POST /api/documents/match-citation ───────────────────────
export const documentsMatchCitationInputSchema = z.object({
  citation: z.unknown(),
  textIndex: z.unknown(),
}).refine(v => v.citation != null && v.textIndex != null, {
  message: "citation and textIndex are required",
});

// ── POST /api/documents/build-text-index ─────────────────────
export const documentsBuildTextIndexInputSchema = z.object({
  text: z.string(),
});

// ── BUG-101: 通用 params 校验 ────────────────────────────────
export const storeNameSchema = z.string().min(1, "store name is required").max(128);
export const recordIdSchema = z.string().min(1, "record id is required").max(512);

// ── PUT /api/data/:store/:id (body) ──────────────────────────
export const dataUpdateInputSchema = z.object({}).passthrough().refine(
  (v) => typeof v === "object" && v !== null && !Array.isArray(v),
  { message: "Body must be a JSON object" }
);

// ── POST /api/ocr (body.lang) ────────────────────────────────
export const ocrLangSchema = z.enum(["chi_sim+eng", "eng", "chi_sim", "chi_tra"]).optional().default("chi_sim+eng");

// ── Knowledge embedding config ───────────────────────────────
export const embeddingConfigSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  modelId: z.string().min(1),
});
