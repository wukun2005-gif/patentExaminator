import { z } from "zod";

const MIN_QUOTE_LENGTH = 20;

export const supportingEvidenceSchema = z.object({
  label: z.string(),
  quote: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"]),
}).refine(
  (data) => {
    if (data.confidence === "high" || data.confidence === "medium") {
      return data.quote != null && data.quote.length >= MIN_QUOTE_LENGTH;
    }
    return true;
  },
  {
    message: `Citation with high/medium confidence must have quote with at least ${MIN_QUOTE_LENGTH} characters`,
    path: ["quote"],
  }
);

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
  supportingEvidence: z.array(supportingEvidenceSchema).optional(),
});

export const reexamDraftSchema = z.object({
  claimNumber: z.number(),
  responseItems: z.array(reexamResponseItemSchema),
  overallAssessment: z.string(),
  defectReviewSummary: z.string().optional(),
  legalCaution: z.string(),
});

export type ReexamDraftOutput = z.infer<typeof reexamDraftSchema>;