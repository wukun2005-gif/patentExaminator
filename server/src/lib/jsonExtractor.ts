export interface JsonExtractResult {
  parsed: unknown;
  raw: string;
}

function stripCodeFences(text: string): string {
  const fencePatterns = [
    /^```(?:json)?\s*\n([\s\S]*?)\n\s*```$/m,
    /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/,
  ];
  for (const pat of fencePatterns) {
    const m = text.match(pat);
    if (m) return m[1]!.trim();
  }
  return text.trim();
}

function findBalancedJson(text: string): string | null {
  const startIdx = text.search(/[{[[]/);
  if (startIdx === -1) return null;

  const open = text[startIdx]!;
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i]!;

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) {
        return text.slice(startIdx, i + 1);
      }
    }
  }

  return null;
}

export function extractJsonFromText(text: string): JsonExtractResult | null {
  const cleaned = stripCodeFences(text);

  try {
    return { parsed: JSON.parse(cleaned), raw: cleaned };
  } catch {
    // full-text parse failed, try balanced extraction
  }

  const balanced = findBalancedJson(cleaned);
  if (balanced) {
    try {
      const parsed = JSON.parse(balanced);
      // Reject trivial non-object parses (e.g. a single number extracted from text)
      if (typeof parsed === "object" && parsed !== null) {
        return { parsed, raw: balanced };
      }
    } catch {
      // balanced extraction failed, fall through
    }
  }

  const greedy = cleaned.match(/\{[\s\S]*\}/);
  if (greedy) {
    try {
      const parsed = JSON.parse(greedy[0]);
      if (typeof parsed === "object" && parsed !== null) {
        return { parsed, raw: greedy[0] };
      }
    } catch {
      // greedy extraction failed
    }
  }

  return null;
}