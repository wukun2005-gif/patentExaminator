/**
 * 服务端权利要求解析模块 — MIGRATE-009
 * 从前端 claimParser.ts 迁移到后端
 */
import type { ClaimNode } from "@shared/types/domain.js";

export interface ParseClaimsResult {
  claims: ClaimNode[];
  warnings: string[];
}

/**
 * Parse claim text into ClaimNode[] with type detection and dependency chain.
 */
export function parseClaims(text: string, caseId: string): ParseClaimsResult {
  const warnings: string[] = [];
  const region = locateClaimRegion(text);
  if (!region) {
    warnings.push("no-claim-region");
    return { claims: [], warnings };
  }

  const rawClaims = splitClaims(region);
  if (rawClaims.length === 0) {
    warnings.push("no-claims-found");
    return { claims: [], warnings };
  }

  const claims: ClaimNode[] = rawClaims.map(({ claimNumber, rawText }) => {
    const type = detectClaimType(rawText);
    const dependsOn = type === "dependent" ? extractDependencies(rawText) : [];

    return {
      id: `${caseId}-claim-${claimNumber}`,
      caseId,
      claimNumber,
      type,
      dependsOn,
      rawText
    };
  });

  // Validation
  validateClaims(claims, warnings);

  return { claims, warnings };
}

/**
 * Locate the claim region in the full text.
 */
function locateClaimRegion(text: string): string | null {
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
function splitClaims(region: string): Array<{ claimNumber: number; rawText: string }> {
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
function detectClaimType(rawText: string): ClaimNode["type"] {
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
function extractDependencies(rawText: string): number[] {
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
function validateClaims(claims: ClaimNode[], warnings: string[]): void {
  if (claims.length === 0) return;

  // Check for duplicate claim numbers
  const numbers = claims.map((c) => c.claimNumber);
  const duplicates = numbers.filter((n, i) => numbers.indexOf(n) !== i);
  if (duplicates.length > 0) {
    warnings.push(`duplicate-claim-numbers: ${[...new Set(duplicates)].join(", ")}`);
  }

  // Check for missing claim numbers (gaps)
  const maxNum = Math.max(...numbers);
  for (let i = 1; i <= maxNum; i++) {
    if (!numbers.includes(i)) {
      warnings.push(`missing-claim-${i}`);
    }
  }

  // Check dependent claims reference valid claims
  for (const claim of claims) {
    if (claim.type === "dependent") {
      for (const dep of claim.dependsOn) {
        if (!numbers.includes(dep)) {
          warnings.push(`claim-${claim.claimNumber}-references-missing-${dep}`);
        }
      }
    }
  }
}
