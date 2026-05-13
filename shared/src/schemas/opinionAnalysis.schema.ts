import { z } from "zod";

export const rejectionGroundSchema = z.object({
  code: z.string(),
  category: z.enum(["novelty", "inventive", "clarity", "support", "amendment", "other"]),
  claimNumbers: z.array(z.number()),
  summary: z.string(),
  legalBasis: z.string(),
  originalText: z.string().optional(),
});

export const rejectionCitedReferenceSchema = z.object({
  publicationNumber: z.string(),
  rejectionGroundCodes: z.array(z.string()),
  featureMapping: z.string(),
});

export const opinionAnalysisSchema = z.object({
  documentId: z.string(),
  rejectionGrounds: z.array(rejectionGroundSchema),
  citedReferences: z.array(rejectionCitedReferenceSchema),
  legalCaution: z.string(),
});

export type OpinionAnalysisOutput = z.infer<typeof opinionAnalysisSchema>;
