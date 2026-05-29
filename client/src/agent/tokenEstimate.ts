/**
 * Token estimation for Chinese + English mixed text.
 * Based on Claude/GPT tokenization patterns:
 * - CJK character: ~1.5 tokens
 * - English word: ~1.3 tokens (varies by word length)
 * - Whitespace: ~0.25 tokens
 * - Punctuation/symbol: ~0.5 tokens
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  let tokens = 0;
  let i = 0;

  while (i < text.length) {
    const ch = text[i]!;
    const code = ch.charCodeAt(0);

    if (code >= 0x4e00 && code <= 0x9fff) {
      // CJK character
      tokens += 1.5;
      i++;
    } else if (code >= 0x3000 && code <= 0x303f) {
      // CJK punctuation
      tokens += 0.75;
      i++;
    } else if (/[a-zA-Z]/.test(ch)) {
      // English word — count until non-letter
      let wordLen = 0;
      while (i < text.length && /[a-zA-Z]/.test(text[i]!)) {
        wordLen++;
        i++;
      }
      // Short words (1-3 chars) ≈ 1 token, longer words ≈ 1.3-1.5 tokens
      tokens += wordLen <= 3 ? 1 : 1 + (wordLen - 3) * 0.3;
    } else if (/\d/.test(ch)) {
      // Number — count until non-digit
      let numLen = 0;
      while (i < text.length && /[\d.]/.test(text[i]!)) {
        numLen++;
        i++;
      }
      tokens += numLen <= 4 ? 1 : 1 + (numLen - 4) * 0.25;
    } else if (ch === ' ' || ch === '\t') {
      tokens += 0.25;
      i++;
    } else if (ch === '\n') {
      tokens += 0.5;
      i++;
    } else {
      // Punctuation, symbols
      tokens += 0.5;
      i++;
    }
  }

  return Math.ceil(tokens);
}
