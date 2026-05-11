import { z } from "zod";

export const searchReferencesCandidateSchema = z.object({
  title: z.string(),
  publicationNumber: z.string(),
  publicationDate: z.string().optional(),
  summary: z.string(),
  relevanceScore: z.number().int().min(0).max(100),
  recommendationReason: z.string(),
  sourceUrl: z.string().optional()
});

export const searchReferencesFilterSchema = z.object({
  candidates: z.array(searchReferencesCandidateSchema).max(10),
  searchQuery: z.string(),
  legalCaution: z
    .string()
    .default("以上为 AI 辅助检索结果，所有文献均来自真实搜索，需审查员逐篇确认。")
});

export type SearchReferencesFilterOutput = z.infer<typeof searchReferencesFilterSchema>;
