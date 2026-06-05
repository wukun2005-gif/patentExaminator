import { z } from "zod";

export const summarySchema = z.object({
  body: z.string().min(1),
  aiNotes: z.string(),
  legalCaution: z.string().default("以上为候选事实整理，不构成法律结论。"),
});

export type SummaryOutput = z.infer<typeof summarySchema>;