import { z } from "zod";
import { citationSchema } from "./claimChart.schema.js";

export const noveltySchema = z.object({
  referenceId: z.string(),
  claimNumber: z.number().int().positive(),
  rows: z
    .array(
      z.object({
        featureCode: z.string(),
        disclosureStatus: z.enum([
          "clearly-disclosed",
          "possibly-disclosed",
          "not-found",
          "not-applicable"
        ]),
        citations: z.array(citationSchema),
        mismatchNotes: z.string().optional(),
        reviewerNotes: z.string().optional()
      })
    )
    .min(1),
  differenceFeatureCodes: z.array(z.string()),
  pendingSearchQuestions: z.array(z.string()).max(5),
  legalCaution: z.string().default("以上为候选事实整理，不构成新颖性法律结论。")
});

export type NoveltyOutput = z.infer<typeof noveltySchema>;
