import { z } from "zod";

export const summarySchema = z.object({
  body: z.string().min(1),
  aiNotes: z.string(),
  legalCaution: z.string(),
});

export type SummaryOutput = z.infer<typeof summarySchema>;