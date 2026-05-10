import type { ISODateTimeString } from "./domain.js";

export interface FeedbackItem {
  id: string;
  caseId: string;
  subjectType: "claim-chart" | "novelty" | "inventive" | "summary" | "draft" | "chat-message";
  subjectId: string;
  verdict: "like" | "dislike";
  comment?: string;
  createdAt: ISODateTimeString;
}
