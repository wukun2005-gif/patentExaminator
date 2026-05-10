import { z } from "zod";

export const inventiveSchema = z.object({
  claimNumber: z.number().int().positive(),
  closestPriorArtId: z.string().optional(),
  sharedFeatureCodes: z.array(z.string()),
  distinguishingFeatureCodes: z.array(z.string()),
  objectiveTechnicalProblem: z.string().optional(),
  motivationEvidence: z
    .array(
      z.object({
        referenceId: z.string(),
        label: z.string(),
        paragraph: z.string().optional(),
        quote: z.string().optional(),
        confidence: z.enum(["high", "medium", "low"])
      })
    )
    .default([]),
  candidateAssessment: z
    .enum([
      "possibly-lacks-inventiveness",
      "possibly-inventive",
      "insufficient-evidence",
      "not-analyzed"
    ])
    .default("not-analyzed"),
  cautions: z.array(z.string()).default([]),
  legalCaution: z.string().default("以上为候选事实整理，不构成创造性法律结论。")
});

export type InventiveOutput = z.infer<typeof inventiveSchema>;
