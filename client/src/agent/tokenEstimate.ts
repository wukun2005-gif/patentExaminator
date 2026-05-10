/**
 * Rough token estimation for Chinese + English mixed text.
 * Rule of thumb: 1 Chinese char ≈ 1.5 tokens, 1 English word ≈ 1 token.
 */
export function estimateTokens(text: string): number {
  let tokens = 0;
  let englishWordCount = 0;

  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0x4e00 && code <= 0x9fff) {
      // CJK character
      tokens += 1.5;
      if (englishWordCount > 0) {
        tokens += englishWordCount * 0.5; // adjust English words
        englishWordCount = 0;
      }
    } else if (/[a-zA-Z]/.test(ch)) {
      englishWordCount++;
    } else {
      if (englishWordCount > 0) {
        tokens += englishWordCount * 0.5;
        englishWordCount = 0;
      }
      tokens += 0.25; // punctuation, whitespace
    }
  }

  if (englishWordCount > 0) {
    tokens += englishWordCount * 0.5;
  }

  return Math.ceil(tokens);
}
