/**
 * JSON Extractor Tests
 * ===================
 *
 * 测试 extractJsonFromText 函数的各种场景：
 * - 正常对象提取
 * - 顶层数组提取（bg-38 修复）
 * - 代码围栏中的 JSON
 * - 边界情况
 */

import { describe, it, expect } from "vitest";
import { extractJsonFromText } from "@server/lib/jsonExtractor";

describe("extractJsonFromText", () => {
  // ══════════════════════════════════════════════════════════════════════
  // 正常对象提取
  // ══════════════════════════════════════════════════════════════════════

  it("extracts simple JSON object", () => {
    const text = '{"name": "test", "value": 123}';
    const result = extractJsonFromText(text);
    expect(result).not.toBeNull();
    expect(result!.parsed).toEqual({ name: "test", value: 123 });
    expect(result!.raw).toBe('{"name": "test", "value": 123}');
  });

  it("extracts JSON object from surrounding text", () => {
    const text = 'Here is the result: {"name": "test"} and some more text';
    const result = extractJsonFromText(text);
    expect(result).not.toBeNull();
    expect(result!.parsed).toEqual({ name: "test" });
  });

  it("extracts nested JSON object", () => {
    const text = '{"outer": {"inner": "value"}, "arr": [1, 2, 3]}';
    const result = extractJsonFromText(text);
    expect(result).not.toBeNull();
    expect(result!.parsed).toEqual({ outer: { inner: "value" }, arr: [1, 2, 3] });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 顶层数组提取（bg-38 修复验证）
  // ══════════════════════════════════════════════════════════════════════

  it("extracts top-level array of objects", () => {
    const text = '[{"id": 1, "name": "first"}, {"id": 2, "name": "second"}]';
    const result = extractJsonFromText(text);
    expect(result).not.toBeNull();
    expect(result!.parsed).toEqual([
      { id: 1, name: "first" },
      { id: 2, name: "second" }
    ]);
  });

  it("extracts top-level array from surrounding text", () => {
    const text = 'Here are the results: [{"id": 1}, {"id": 2}] end of results';
    const result = extractJsonFromText(text);
    expect(result).not.toBeNull();
    expect(result!.parsed).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("extracts empty array", () => {
    const text = '[]';
    const result = extractJsonFromText(text);
    expect(result).not.toBeNull();
    expect(result!.parsed).toEqual([]);
  });

  it("extracts array with mixed types", () => {
    const text = '[1, "two", true, null, {"key": "value"}]';
    const result = extractJsonFromText(text);
    expect(result).not.toBeNull();
    expect(result!.parsed).toEqual([1, "two", true, null, { key: "value" }]);
  });

  it("extracts nested arrays", () => {
    const text = '[[1, 2], [3, 4], {"nested": [5, 6]}]';
    const result = extractJsonFromText(text);
    expect(result).not.toBeNull();
    expect(result!.parsed).toEqual([[1, 2], [3, 4], { nested: [5, 6] }]);
  });

  // ══════════════════════════════════════════════════════════════════════
  // 代码围栏提取
  // ══════════════════════════════════════════════════════════════════════

  it("extracts JSON from code fence with json language", () => {
    const text = '```json\n{"name": "test"}\n```';
    const result = extractJsonFromText(text);
    expect(result).not.toBeNull();
    expect(result!.parsed).toEqual({ name: "test" });
  });

  it("extracts JSON from code fence without language", () => {
    const text = '```\n{"name": "test"}\n```';
    const result = extractJsonFromText(text);
    expect(result).not.toBeNull();
    expect(result!.parsed).toEqual({ name: "test" });
  });

  it("extracts array from code fence", () => {
    const text = '```json\n[{"id": 1}, {"id": 2}]\n```';
    const result = extractJsonFromText(text);
    expect(result).not.toBeNull();
    expect(result!.parsed).toEqual([{ id: 1 }, { id: 2 }]);
  });

  // ══════════════════════════════════════════════════════════════════════
  // 边界情况
  // ══════════════════════════════════════════════════════════════════════

  it("returns null for empty string", () => {
    const result = extractJsonFromText("");
    expect(result).toBeNull();
  });

  it("returns null for whitespace only", () => {
    const result = extractJsonFromText("   \n\t  ");
    expect(result).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    const result = extractJsonFromText("{invalid json}");
    expect(result).toBeNull();
  });

  it("extracts primitive number", () => {
    const result = extractJsonFromText("123");
    expect(result).not.toBeNull();
    expect(result!.parsed).toBe(123);
  });

  it("extracts primitive string", () => {
    const result = extractJsonFromText('"just a string"');
    expect(result).not.toBeNull();
    expect(result!.parsed).toBe("just a string");
  });

  it("extracts primitive boolean", () => {
    const result = extractJsonFromText("true");
    expect(result).not.toBeNull();
    expect(result!.parsed).toBe(true);
  });

  // ══════════════════════════════════════════════════════════════════════
  // 复杂场景
  // ══════════════════════════════════════════════════════════════════════

  it("handles JSON with escaped quotes", () => {
    const text = '{"message": "He said \\"hello\\""}';
    const result = extractJsonFromText(text);
    expect(result).not.toBeNull();
    expect(result!.parsed).toEqual({ message: 'He said "hello"' });
  });

  it("handles JSON with newlines in strings", () => {
    const text = '{"text": "line1\\nline2\\nline3"}';
    const result = extractJsonFromText(text);
    expect(result).not.toBeNull();
    expect(result!.parsed).toEqual({ text: "line1\nline2\nline3" });
  });

  it("handles JSON with unicode characters", () => {
    const text = '{"name": "测试", "emoji": "🎉"}';
    const result = extractJsonFromText(text);
    expect(result).not.toBeNull();
    expect(result!.parsed).toEqual({ name: "测试", emoji: "🎉" });
  });

  it("extracts first valid JSON when multiple exist", () => {
    const text = 'First: {"a": 1} Second: {"b": 2}';
    const result = extractJsonFromText(text);
    expect(result).not.toBeNull();
    // Should extract the first valid JSON
    expect(result!.parsed).toEqual({ a: 1 });
  });

  it("handles malformed JSON gracefully", () => {
    const text = '{"incomplete": "json"';
    const result = extractJsonFromText(text);
    expect(result).toBeNull();
  });

  it("handles JSON with trailing comma", () => {
    const text = '{"key": "value",}';
    const result = extractJsonFromText(text);
    // JSON.parse doesn't allow trailing commas
    expect(result).toBeNull();
  });
});
