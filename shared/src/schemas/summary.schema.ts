import { z } from "zod";

export const summarySchema = z.object({
  title: z.string().min(1),
  technicalField: z.string().optional(),
  problem: z.string().min(1),
  solution: z.string().min(1),
  keyFeatures: z
    .array(
      z.object({
        featureCode: z.string(),
        description: z.string(),
        citation: z.string().optional()
      })
    )
    .min(1),
  legalCaution: z.string().default("以上为技术简述，不构成法律结论。")
});

export type SummaryOutput = z.infer<typeof summarySchema>;
