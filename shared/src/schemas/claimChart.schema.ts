import { z } from "zod";

export const citationSchema = z.object({
  label: z.string(),
  paragraph: z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => (v === undefined || v === null || v === "" ? undefined : String(v)))
    .optional(),
  /** @internal — AI 不生成，预留供 UI 手动标注行号范围 */
  lineStart: z.number().int().optional(),
  /** @internal — AI 不生成，预留供 UI 手动标注行号范围 */
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
        /** @internal — AI 不生成，预留供 UI 手动备注 */
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
