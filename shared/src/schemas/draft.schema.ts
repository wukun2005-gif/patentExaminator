import { z } from "zod";

export const draftSchema = z.object({
  sections: z.object({
    body: z.string().default(""),
    aiNotes: z.string().default(""),
    analysisStrategy: z.string().default(""),
    pendingConfirmation: z.string().default("")
  }),
  legalCaution: z.string().default("以上为审查素材草稿，不构成法律结论。")
});

export type DraftOutput = z.infer<typeof draftSchema>;
