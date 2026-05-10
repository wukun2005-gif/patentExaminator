import { z } from "zod";

export const exportSchema = z.object({
  format: z.enum(["html", "markdown"]),
  caseId: z.string(),
  title: z.string(),
  content: z.string(),
  fileName: z.string().optional()
});

export type ExportOutput = z.infer<typeof exportSchema>;
