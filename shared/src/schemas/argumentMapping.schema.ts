import { z } from "zod";

export const amendedClaimDetailSchema = z.object({
  claimNumber: z.number(),
  originalText: z.string(),
  amendedText: z.string(),
  changeDescription: z.string(),
});

export const argumentMappingEntrySchema = z.object({
  rejectionGroundCode: z.string(),
  applicantArgument: z.string(),
  argumentSummary: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  amendedClaims: z.array(amendedClaimDetailSchema).optional(),
  newEvidence: z.string().optional(),
});

export const argumentMappingSchema = z.object({
  mappings: z.array(argumentMappingEntrySchema),
  unmappedGrounds: z.array(z.string()).optional(),
  legalCaution: z.string(),
});

export type ArgumentMappingOutput = z.infer<typeof argumentMappingSchema>;
