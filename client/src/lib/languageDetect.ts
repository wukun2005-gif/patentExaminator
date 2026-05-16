const CJK_RANGES: [number, number][] = [
  [0x4E00, 0x9FFF],
  [0x3400, 0x4DBF],
  [0xF900, 0xFAFF],
  [0x2E80, 0x2EFF],
  [0x3000, 0x303F],
  [0x31C0, 0x31EF],
  [0x3200, 0x32FF],
  [0x3300, 0x33FF],
  [0xFE30, 0xFE4F],
  [0xFF00, 0xFFEF],
  [0x20000, 0x2A6DF],
  [0x2A700, 0x2B73F],
  [0x2B740, 0x2B81F],
  [0x2B820, 0x2CEAF],
  [0x2CEB0, 0x2EBEF],
  [0x2F800, 0x2FA1F],
];

function isCJK(char: string): boolean {
  const code = char.codePointAt(0);
  if (code == null) return false;
  return CJK_RANGES.some(([lo, hi]) => code >= lo && code <= hi);
}

export function detectLanguage(text: string): "zh" | "en" | "other" {
  if (!text || text.trim().length === 0) return "other";

  const chars = [...text].filter((c) => c.trim().length > 0);
  if (chars.length === 0) return "other";

  const cjkCount = chars.filter(isCJK).length;
  const ratio = cjkCount / chars.length;

  if (ratio >= 0.3) return "zh";
  return "en";
}

export const LANGUAGE_LABELS: Record<string, string> = {
  zh: "中文",
  en: "英文",
  other: "其他",
};