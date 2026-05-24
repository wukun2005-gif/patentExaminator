import { z } from "zod";

export const defectItemSchema = z.object({
  category: z.string(),
  description: z.string().min(1),
  location: z.string().optional(),
  severity: z.enum(["error", "warning", "info"]),
  previouslyRaised: z.boolean().optional(),
  overcomeStatus: z.enum(["overcome", "not-overcome", "partially-overcome"]).optional(),
});

export const defectSchema = z.object({
  defects: z.array(defectItemSchema),
  warnings: z.array(z.string()),
  legalCaution: z.string(),
});

export type DefectOutput = z.infer<typeof defectSchema>;