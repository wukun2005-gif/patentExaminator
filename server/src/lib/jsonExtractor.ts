export interface JsonExtractResult {
  parsed: unknown;
  raw: string;
}

/**
 * LLM 常在 JSON 字符串值内输出字面换行符/制表符（非法 JSON）。
 * 逐字符扫描，在字符串上下文内将 \n→\\n、\r→\\r、\t→\\t。
 */
function repairJsonLiterals(text: string): string {
  const out: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (esc) { out.push(ch); esc = false; continue; }
    if (ch === '\\' && inStr) { out.push(ch); esc = true; continue; }
    if (ch === '"') { inStr = !inStr; out.push(ch); continue; }
    if (inStr) {
      if (ch === '\n') { out.push('\\n'); continue; }
      if (ch === '\r') { out.push('\\r'); continue; }
      if (ch === '\t') { out.push('\\t'); continue; }
    }
    out.push(ch);
  }
  return out.join('');
}

function stripCodeFences(text: string): string {
  const fencePatterns = [
    /^```(?:json)?\s*\n([\s\S]*?)\n\s*```$/m,
    /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/,
  ];
  for (const pat of fencePatterns) {
    const m = text.match(pat);
    if (m?.[1]) return m[1].trim();
  }
  return text.trim();
}

function findBalancedJson(text: string): string | null {
  const startIdx = text.search(/[{[[]/);
  if (startIdx === -1) return null;

  const open = text[startIdx];
  if (!open) return null;
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    if (ch === undefined) continue;

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

  const greedy = cleaned.match(/(?:\{[\s\S]*\}|\[[\s\S]*\])/);
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

  // LLM 常在 JSON 字符串值内输出字面换行符 — 修复后重试
  const repaired = repairJsonLiterals(cleaned);
  if (repaired !== cleaned) {
    try {
      const parsed = JSON.parse(repaired);
      if (typeof parsed === "object" && parsed !== null) {
        return { parsed, raw: repaired };
      }
    } catch {
      // repaired parse failed
    }
    const repairedBalanced = findBalancedJson(repaired);
    if (repairedBalanced) {
      try {
        const parsed = JSON.parse(repairedBalanced);
        if (typeof parsed === "object" && parsed !== null) {
          return { parsed, raw: repairedBalanced };
        }
      } catch {
        // repaired balanced extraction failed
      }
    }
  }

  return null;
}