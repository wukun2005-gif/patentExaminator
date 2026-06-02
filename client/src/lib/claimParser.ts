import type { ClaimNode } from "@shared/types/domain";

export interface ParseClaimsResult {
  claims: ClaimNode[];
  warnings: string[];
}

/**
 * Parse claim text into ClaimNode[] with type detection and dependency chain.
 * MIGRATE-009: 调用后端 API 进行权利要求解析
 */
export async function parseClaims(text: string, caseId: string): Promise<ParseClaimsResult> {
  const res = await fetch("/api/documents/parse-claims", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, caseId }),
  });

  if (!res.ok) {
    throw new Error(`Parse claims failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as { ok: boolean; claims: ClaimNode[]; warnings: string[] };
  return { claims: data.claims, warnings: data.warnings };
}

/**
 * Locate the claim region in the full text.
 */
function _locateClaimRegion(text: string): string | null {
  // Try: after "权利要求书" header
  const headerMatch = text.match(/权利\s*要求\s*书/);
  if (headerMatch) {
    const start = (headerMatch.index ?? 0) + headerMatch[0].length;
    // Find next section header
    const nextSection = text.slice(start).match(/\n\s*(说明书|说明书附图|摘要|权利要求)/);
    const end = nextSection ? start + (nextSection.index ?? 0) : text.length;
    return text.slice(start, end).trim();
  }

  // Fallback: search for first claim pattern
  const firstClaim = text.match(/(?:^|\n)\s*(?:权利要求)?\s*1\s*[.．、。:：]/);
  if (firstClaim) {
    return text.slice(firstClaim.index).trim();
  }

  return null;
}

/**
 * Split claim region into individual claims.
 */
function _splitClaims(region: string): Array<{ claimNumber: number; rawText: string }> {
  const CLAIM_HEAD = /(?:^|\n)\s*(?:权利要求)?\s*(\d{1,3})\s*[.．、。:：]\s*/g;
  const matches: Array<{ claimNumber: number; index: number; endIndex: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = CLAIM_HEAD.exec(region)) !== null) {
    matches.push({
      claimNumber: parseInt(match[1]!, 10),
      index: match.index,
      endIndex: match.index + match[0].length
    });
  }

  if (matches.length === 0) return [];

  const claims: Array<{ claimNumber: number; rawText: string }> = [];
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]!;
    const next = matches[i + 1];
    const rawText = region.slice(current.endIndex, next ? next.index : region.length).trim();
    claims.push({ claimNumber: current.claimNumber, rawText });
  }

  return claims;
}

/**
 * Detect claim type: independent, dependent, or unknown.
 */
function _detectClaimType(rawText: string): ClaimNode["type"] {
  // Check for dependency references first (takes precedence)
  const depPattern = /(?:根据|如)?权利要求\s*(\d+)(?:\s*(?:或|至|到|[-–—])\s*(\d+))?\s*(?:所述|中)/;
  if (depPattern.test(rawText)) return "dependent";

  // Check for independent claim patterns
  const indepPattern = /^(?:一种|一个|一套|一种用于|一种基于)/;
  if (indepPattern.test(rawText.trim())) return "independent";

  return "unknown";
}

/**
 * Extract dependency claim numbers from dependent claim text.
 */
function _extractDependencies(rawText: string): number[] {
  const deps: number[] = [];

  // Match "权利要求 N" and "权利要求 N 或 M" and "权利要求 N 至 M"
  const patterns = [
    /权利要求\s*(\d+)/g,
    /权利要求\s*(\d+)\s*(?:或|至|到|[-–—])\s*(\d+)/g
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(rawText)) !== null) {
      const n1 = parseInt(match[1]!, 10);
      deps.push(n1);
      if (match[2]) {
        const n2 = parseInt(match[2], 10);
        // Add all numbers in range
        for (let i = n1 + 1; i <= n2; i++) {
          deps.push(i);
        }
      }
    }
  }

  return [...new Set(deps)].sort((a, b) => a - b);
}

/**
 * Validate claims consistency.
 */
function _validateClaims(claims: ClaimNode[], warnings: string[]): void {
  // Check for at least one independent claim
  const hasIndependent = claims.some((c) => c.type === "independent");
  if (!hasIndependent) warnings.push("no-independent-claim");

  // Check numbering continuity
  const numbers = claims.map((c) => c.claimNumber).sort((a, b) => a - b);
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i]! - numbers[i - 1]! > 1) {
      warnings.push(`gap-in-claim-numbers: ${numbers[i - 1]}-${numbers[i]}`);
    }
  }

  // Check dependency validity
  for (const claim of claims) {
    for (const dep of claim.dependsOn) {
      if (dep >= claim.claimNumber) {
        warnings.push(`invalid-dependency: claim ${claim.claimNumber} depends on ${dep}`);
      }
      if (!claims.some((c) => c.claimNumber === dep)) {
        warnings.push(`missing-dependency: claim ${claim.claimNumber} depends on non-existent ${dep}`);
      }
    }
  }
}
