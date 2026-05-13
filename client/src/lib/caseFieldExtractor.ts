import type { AgentClient } from "../agent/AgentClient";
import type { ClaimNode } from "@shared/types/domain";
import { parseClaims } from "./claimParser";

export interface ExtractedFields {
  title: string | null;
  applicationNumber: string | null;
  applicant: string | null;
  applicationDate: string | null;
  priorityDate: string | null;
  targetClaimNumber: number | null;
  claims: ClaimNode[];
  confidence: Record<string, "high" | null>;
}

/**
 * Extract case baseline fields + claims from patent documents via AI.
 * Sends full document text to AI for comprehensive extraction.
 * Throws on failure — caller should handle fallback.
 */
export async function extractCaseFields(
  documents: Array<{ fileName: string; text: string }>,
  caseId: string,
  agentClient: AgentClient
): Promise<ExtractedFields> {
  const response = await agentClient.runExtractCaseFields({
    caseId,
    documents
  });

  const claims: ClaimNode[] = (response.claims ?? []).map((c) => ({
    id: `${caseId}-claim-${c.claimNumber}`,
    caseId,
    claimNumber: c.claimNumber,
    type: c.type,
    dependsOn: c.dependsOn,
    rawText: c.rawText
  }));

  // Find target claim: smallest independent claim number
  const indep = claims.filter((c) => c.type === "independent");
  const targetClaimNumber = indep.length > 0
    ? Math.min(...indep.map((c) => c.claimNumber))
    : response.title ? 1 : null;

  const confidence: Record<string, "high" | null> = {
    title: response.title ? "high" : null,
    applicationNumber: response.applicationNumber ? "high" : null,
    applicant: response.applicant ? "high" : null,
    applicationDate: response.applicationDate ? "high" : null,
    priorityDate: response.priorityDate ? "high" : null,
    targetClaimNumber: targetClaimNumber ? "high" : null
  };

  return {
    title: response.title,
    applicationNumber: response.applicationNumber,
    applicant: response.applicant,
    applicationDate: response.applicationDate,
    priorityDate: response.priorityDate,
    targetClaimNumber,
    claims,
    confidence
  };
}

/**
 * Fallback: regex for bibliographic fields, parseClaims for claims.
 * Exported for use when AI extraction fails.
 */
export function extractCaseFieldsFallback(
  documents: Array<{ fileName: string; text: string }>,
  caseId: string
): ExtractedFields {
  const combined = documents.map((d) => d.text).join("\n\n");
  const front = combined.slice(0, 3000);
  const confidence: Record<string, "high" | null> = {
    title: null,
    applicationNumber: null,
    applicant: null,
    applicationDate: null,
    priorityDate: null,
    targetClaimNumber: null
  };

  const applicationNumber = extractApplicationNumber(front);
  if (applicationNumber) confidence.applicationNumber = "high";

  const title = extractTitle(front);
  if (title) confidence.title = "high";

  const applicant = extractApplicant(front);
  if (applicant) confidence.applicant = "high";

  const applicationDate = extractDate(front, /申请日[：:\s]*/);
  if (applicationDate) confidence.applicationDate = "high";

  const priorityDate = extractDate(front, /优先权[日]?[：:\s]*/);
  if (priorityDate) confidence.priorityDate = "high";

  // Use parseClaims for claims
  let claims: ClaimNode[] = [];
  let targetClaimNumber: number | null = null;
  try {
    const parsed = parseClaims(combined, caseId);
    claims = parsed.claims;
    const indep = claims.filter((c) => c.type === "independent");
    if (indep.length > 0) {
      targetClaimNumber = Math.min(...indep.map((c) => c.claimNumber));
      confidence.targetClaimNumber = "high";
    }
  } catch {
    // parseClaims may fail
  }

  return {
    title,
    applicationNumber,
    applicant,
    applicationDate,
    priorityDate,
    targetClaimNumber,
    claims,
    confidence
  };
}

function extractApplicationNumber(text: string): string | null {
  // Labeled: "申请号：202410567890.1" or "申请号：CN202410567890A"
  const labeled = text.match(/申请号[：:\s]*([A-Z]{0,2}\d{9,14}[.-]?\d{0,2}[A-Z]?)/);
  if (labeled?.[1]) return labeled[1].trim();
  // Standalone: CN202410567890A
  const standalone = text.match(/\b(CN\d{9,13}[A-Z]?)\b/);
  if (standalone?.[1]) return standalone[1];
  return null;
}

function extractTitle(text: string): string | null {
  const match = text.match(/发明名称[：:\s]*([^\n]+)/);
  if (match?.[1]) {
    const title = match[1].trim();
    if (title.length >= 2 && title.length <= 120) return title;
  }
  const fallback = text.match(/(?:^|\n)\s*名称[：:\s]*([^\n]+)/);
  if (fallback?.[1]) {
    const title = fallback[1].trim();
    if (title.length >= 2 && title.length <= 120) return title;
  }
  return null;
}

function extractApplicant(text: string): string | null {
  const match = text.match(/申请人[：:\s]*([^\n]+)/);
  if (match?.[1]) {
    const applicant = match[1].trim();
    if (applicant.length >= 1 && applicant.length <= 120) return applicant;
  }
  return null;
}

function extractDate(text: string, labelPattern: RegExp): string | null {
  const datePattern = /(\d{4})[.\-/年](\d{1,2})[.\-/月](\d{1,2})[日]?/;
  const combined = new RegExp(labelPattern.source + datePattern.source);
  const match = text.match(combined);
  if (match) {
    const year = match[match.length - 3];
    const month = match[match.length - 2]!.padStart(2, "0");
    const day = match[match.length - 1]!.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return null;
}
