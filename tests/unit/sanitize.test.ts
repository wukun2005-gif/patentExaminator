import { describe, it, expect } from "vitest";
import { sanitizeText } from "@server/security/sanitize";

describe("sanitizeText (TC-6)", () => {
  it("replaces email addresses", () => {
    const result = sanitizeText("Contact user@example.com for details");
    expect(result).toContain("[EMAIL]");
    expect(result).not.toContain("user@example.com");
  });

  it("replaces Chinese phone numbers", () => {
    const result = sanitizeText("Call 13812345678 for info");
    expect(result).toContain("[PHONE]");
    expect(result).not.toContain("13812345678");
  });

  it("replaces API keys with sk-/tp-/ak- prefix", () => {
    const result = sanitizeText("Key: sk-abcdefghijklmnopqrstuvwx");
    expect(result).toContain("[API_KEY]");
  });

  it("strips zero-width characters", () => {
    // U+200B (ZWSP), U+200C (ZWNJ), U+200D (ZWJ), U+FEFF (BOM)
    const text = "hello​world‌test‍end﻿";
    const result = sanitizeText(text);
    expect(result).toBe("helloworldtestend");
  });

  it("does not modify normal text", () => {
    const text = "这是一个正常的专利文档文本，没有敏感信息。";
    const result = sanitizeText(text);
    expect(result).toBe(text);
  });

  it("applies custom rules", () => {
    const result = sanitizeText("ID: CASE-12345", [
      { pattern: "CASE-\\d+", replace: "[CASE_ID]" }
    ]);
    expect(result).toContain("[CASE_ID]");
    expect(result).not.toContain("CASE-12345");
  });

  it("skips invalid custom regex patterns", () => {
    const text = "test [invalid";
    const result = sanitizeText(text, [
      { pattern: "[invalid", replace: "[REDACTED]" }
    ]);
    // Should not throw, text unchanged
    expect(result).toBe(text);
  });

  it("handles empty string", () => {
    expect(sanitizeText("")).toBe("");
  });

  it("handles text with multiple sensitive patterns", () => {
    const text = "Email user@test.com, phone 13900001111, key sk-abcdefghij1234567890";
    const result = sanitizeText(text);
    expect(result).toContain("[EMAIL]");
    expect(result).toContain("[PHONE]");
    expect(result).toContain("[API_KEY]");
  });
});
