import { z } from "zod";

export const reexamResponseItemSchema = z.object({
  rejectionGroundCode: z.string(),
  category: z.string(),
  applicantArgumentSummary: z.string(),
  examinerResponse: z.string(),
  conclusion: z.enum([
    "argument-accepted",
    "argument-partially-accepted",
    "argument-rejected",
    "needs-further-review"
  ]),
  supportingEvidence: z.array(z.object({
    label: z.string(),
    quote: z.string().optional(),
    confidence: z.enum(["high", "medium", "low"]),
  })).optional(),
});

export const reexamDraftSchema = z.object({
  claimNumber: z.number(),
  responseItems: z.array(reexamResponseItemSchema),
  overallAssessment: z.string(),
  defectReviewSummary: z.string().optional(),
  legalCaution: z.string(),
});

export type ReexamDraftOutput = z.infer<typeof reexamDraftSchema>;
