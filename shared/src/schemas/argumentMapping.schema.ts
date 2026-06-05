import { z } from "zod";

export const amendedClaimDetailSchema = z.object({
  claimNumber: z.number(),
  originalText: z.string(),
  amendedText: z.string(),
  changeDescription: z.string(),
});

const amendedClaimItemSchema = z.union([
  amendedClaimDetailSchema,
  z.string().transform((s) => ({
    claimNumber: 0,
    originalText: "",
    amendedText: "",
    changeDescription: s,
  })),
]);

export const argumentMappingEntrySchema = z.object({
  rejectionGroundCode: z.string(),
  applicantArgument: z.string(),
  argumentSummary: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  amendedClaims: z.array(amendedClaimItemSchema).optional(),
  newEvidence: z.string().optional(),
});

export const argumentMappingSchema = z.object({
  mappings: z.array(argumentMappingEntrySchema),
  unmappedGrounds: z.array(z.string()).optional(),
  legalCaution: z.string().default("以上为候选事实整理，不构成法律结论。"),
});

export type ArgumentMappingOutput = z.infer<typeof argumentMappingSchema>;
