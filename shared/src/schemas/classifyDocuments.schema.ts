import { z } from "zod";

export const documentRoleSchema = z.enum([
  "application",
  "office-action",
  "office-action-response",
  "reference",
]);

export const confidenceSchema = z.enum(["high", "medium", "low"]);

export const documentClassificationSchema = z.object({
  fileIndex: z.number().int().nonnegative(),
  fileName: z.string().min(1),
  role: documentRoleSchema,
  confidence: confidenceSchema,
  reason: z.string(),
});

export const classifyDocumentsOutputSchema = z.object({
  classifications: z.array(documentClassificationSchema).min(1),
  warnings: z.array(z.string()).optional(),
});

export type DocumentRole = z.infer<typeof documentRoleSchema>;
export type DocumentClassification = z.infer<typeof documentClassificationSchema>;
export type ClassifyDocumentsOutput = z.infer<typeof classifyDocumentsOutputSchema>;