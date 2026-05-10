import { z } from "zod";

export const citationSchema = z.object({
  label: z.string(),
  paragraph: z.string().optional(),
  lineStart: z.number().int().optional(),
  lineEnd: z.number().int().optional(),
  quote: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"])
});

export const claimChartSchema = z.object({
  claimNumber: z.number().int().positive(),
  features: z
    .array(
      z.object({
        featureCode: z.string().regex(/^[A-Z]{1,2}$/),
        description: z.string().min(1),
        specificationCitations: z.array(citationSchema),
        citationStatus: z.enum(["confirmed", "needs-review", "not-found"]),
        userNotes: z.string().optional()
      })
    )
    .min(1),
  warnings: z
    .array(
      z.object({
        type: z.enum([
          "functional-language",
          "ambiguous-claim-type",
          "unsupported-feature",
          "other"
        ]),
        message: z.string()
      })
    )
    .default([]),
  pendingSearchQuestions: z.array(z.string()).max(5).default([]),
  legalCaution: z.string().default("以上为候选事实整理，不构成法律结论。")
});

export type ClaimChartOutput = z.infer<typeof claimChartSchema>;
