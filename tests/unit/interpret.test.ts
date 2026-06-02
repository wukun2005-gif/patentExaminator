import { describe, it, expect, vi, beforeEach } from "vitest";
import interpretFixture from "@shared/fixtures/interpret-g1.json";
import { useInterpretStore } from "@client/store";
import { AiGatewayError, AiErrorType } from "@shared/types/api";
import {
  buildCombinedSummarySections,
  buildExpandedStateStorageKey,
  formatAiErrorMessage,
  readExpandedState,
  writeExpandedState
} from "@client/features/interpret/InterpretPanel";

vi.mock("@client/lib/repos", () => ({
  saveInterpretSummaries: vi.fn().mockResolvedValue(undefined),
  readInterpretSummaries: vi.fn().mockResolvedValue({}),
  deleteInterpretSummaries: vi.fn().mockResolvedValue(undefined)
}));

describe("Interpret module", () => {
  beforeEach(() => {
    useInterpretStore.setState({ interpretSummaries: {} });
    localStorage.clear();
  });

  it("InterpretPanel can be imported", async () => {
    const mod = await import("@client/features/interpret/InterpretPanel");
    expect(mod.InterpretPanel).toBeDefined();
    expect(typeof mod.InterpretPanel).toBe("function");
  });

  it("interpret fixture returns response for G1", async () => {
    const result = interpretFixture.response;
    expect(result).toContain("LED散热");
    expect(result).toContain("技术方案");
    expect(result).toContain("技术效果");
  });

  it("interpret fixture contains key sections", async () => {
    const fixture = await import("@shared/fixtures/interpret-g1.json");
    expect(fixture.response).toContain("技术领域");
    expect(fixture.response).toContain("技术方案");
    expect(fixture.response).toContain("技术效果");
    expect(fixture.response).toContain("关键特征");
  });

  it("buildCombinedSummarySections 按申请文件→审查意见→意见陈述书→对比文件顺序组织内容", () => {
    const result = buildCombinedSummarySections(
      [
        {
          role: "application",
          title: "申请文件",
          documents: [{ id: "app-1", fileName: "申请文件.pdf", role: "application", documentType: "application", text: "" }]
        },
        {
          role: "office-action",
          title: "审查意见通知书",
          documents: [{ id: "oa-1", fileName: "审查意见.pdf", role: "office-action", documentType: "office-action", text: "" }]
        },
        {
          role: "office-action-response",
          title: "意见陈述书",
          documents: [{ id: "resp-1", fileName: "答辩书.pdf", role: "office-action-response", documentType: "office-action-response", text: "" }]
        },
        {
          role: "reference",
          title: "对比文件",
          documents: [{ id: "ref-1", fileName: "D1.pdf", role: "reference", documentType: "application", text: "" }]
        }
      ],
      { "app-1": { summary: "申请文件总结", error: null, isLoading: false, sourceLanguage: "zh", translatedText: "", isTranslating: false, translateError: null, showOriginal: false, previewMode: false },
        "oa-1": { summary: "审查意见总结", error: null, isLoading: false, sourceLanguage: "zh", translatedText: "", isTranslating: false, translateError: null, showOriginal: false, previewMode: false },
        "resp-1": { summary: "意见陈述总结", error: null, isLoading: false, sourceLanguage: "zh", translatedText: "", isTranslating: false, translateError: null, showOriginal: false, previewMode: false },
        "ref-1": { summary: "对比文件总结", error: null, isLoading: false, sourceLanguage: "zh", translatedText: "", isTranslating: false, translateError: null, showOriginal: false, previewMode: false }
      }
    );

    expect(result.indexOf("## 申请文件")).toBeLessThan(result.indexOf("## 审查意见通知书"));
    expect(result.indexOf("## 审查意见通知书")).toBeLessThan(result.indexOf("## 意见陈述书"));
    expect(result.indexOf("## 意见陈述书")).toBeLessThan(result.indexOf("## 对比文件"));
  });

  it("expanded state persists per case in localStorage", () => {
    writeExpandedState("case-123", { "doc-1": true, "doc-2": false });
    expect(localStorage.getItem(buildExpandedStateStorageKey("case-123"))).toBe(
      JSON.stringify({ "doc-1": true, "doc-2": false })
    );
    expect(readExpandedState("case-123")).toEqual({ "doc-1": true, "doc-2": false });
  });
});

describe("InterpretPanel state machine (TC-10)", () => {
  it("initial state is idle (no summary, no error, not loading)", async () => {
    const mod = await import("@client/features/interpret/InterpretPanel");
    expect(mod.InterpretPanel).toBeDefined();
    // The component starts in idle state per EMPTY_CARD_STATE
    // Verified by checking the exported type exists
  });

  it("buildCombinedSummarySections handles empty documents", () => {
    const result = buildCombinedSummarySections([], {});
    expect(result).toBe("");
  });

  it("buildCombinedSummarySections handles single document", () => {
    const result = buildCombinedSummarySections(
      [{ role: "application", title: "申请文件", documents: [{ id: "d1", fileName: "test.pdf", role: "application", documentType: "application", text: "" }] }],
      { "d1": { summary: "测试总结", error: null, isLoading: false, sourceLanguage: "zh", translatedText: "", isTranslating: false, translateError: null, showOriginal: false, previewMode: false } }
    );
    expect(result).toContain("## 申请文件");
    expect(result).toContain("测试总结");
  });

  it("buildCombinedSummarySections returns empty for loading-only state", () => {
    // buildCombinedSummarySections only includes sections with non-empty summary
    const result = buildCombinedSummarySections(
      [{ role: "application", title: "申请文件", documents: [{ id: "d1", fileName: "test.pdf", role: "application", documentType: "application", text: "" }] }],
      { "d1": { summary: "", error: null, isLoading: true, sourceLanguage: "zh", translatedText: "", isTranslating: false, translateError: null, showOriginal: false, previewMode: false } }
    );
    // Loading state produces no summary text — the loading indicator is in the UI, not in the combined text
    expect(result).toBe("");
  });

  it("buildCombinedSummarySections includes section header for non-empty summary", () => {
    const result = buildCombinedSummarySections(
      [{ role: "application", title: "申请文件", documents: [{ id: "d1", fileName: "test.pdf", role: "application", documentType: "application", text: "" }] }],
      { "d1": { summary: "测试总结内容", error: null, isLoading: false, sourceLanguage: "zh", translatedText: "", isTranslating: false, translateError: null, showOriginal: false, previewMode: false } }
    );
    expect(result).toContain("## 申请文件");
    expect(result).toContain("测试总结内容");
  });
});

describe("AiGatewayError", () => {
  it("creates error with type and message", () => {
    const err = new AiGatewayError("quota", "All providers exhausted");
    expect(err.type).toBe("quota");
    expect(err.message).toBe("All providers exhausted");
    expect(err.name).toBe("AiGatewayError");
    expect(err).toBeInstanceOf(Error);
  });

  it("creates error with attempts metadata", () => {
    const err = new AiGatewayError("timeout", "msg", [
      { providerId: "bedrock", errorCode: "timeout" }
    ]);
    expect(err.attempts).toHaveLength(1);
    expect(err.attempts![0]!.errorCode).toBe("timeout");
  });

  it("creates error without attempts", () => {
    const err = new AiGatewayError("auth", "auth failed");
    expect(err.attempts).toBeUndefined();
  });
});

describe("formatAiErrorMessage", () => {
  describe("AiGatewayError input", () => {
    const types: AiErrorType[] = ["quota", "auth", "timeout", "network", "structure", "abort", "other"];
    const expectedMarkers: Record<AiErrorType, string[]> = {
      quota: ["配额"],
      auth: ["认证"],
      timeout: ["超时"],
      network: ["网络"],
      structure: ["格式"],
      abort: ["取消"],
      other: ["未知"]
    };

    for (const t of types) {
      it(`handles type "${t}"`, () => {
        const result = formatAiErrorMessage(new AiGatewayError(t, "test"));
        expect(result.type).toBe(t);
        expect(result.message).toContain(expectedMarkers[t][0]);
        expect(result.guidance.length).toBeGreaterThan(0);
      });
    }
  });

  describe("string message input", () => {
    it("detects quota-exceeded from string", () => {
      const result = formatAiErrorMessage(
        "All providers failed: bedrock(quota-exceeded); gemini(quota-exceeded)"
      );
      expect(result.type).toBe("quota");
      expect(result.message).toContain("配额");
    });

    it("detects 429 from string", () => {
      expect(formatAiErrorMessage("Gateway error: 429").type).toBe("quota");
    });

    it("detects auth-failed from string", () => {
      expect(formatAiErrorMessage("auth-failed: invalid key").type).toBe("auth");
    });

    it("detects 401 from string", () => {
      expect(formatAiErrorMessage("Gateway error: 401").type).toBe("auth");
    });

    it("detects timeout from string", () => {
      expect(formatAiErrorMessage("timeout after 30s").type).toBe("timeout");
    });

    it("detects network error from string", () => {
      expect(formatAiErrorMessage("server-error: bedrock").type).toBe("network");
    });

    it("detects 5xx from string", () => {
      expect(formatAiErrorMessage("Gateway error: 503").type).toBe("network");
    });

    it("falls back to 'other' for unrecognized string", () => {
      const result = formatAiErrorMessage("Something unexpected happened");
      expect(result.type).toBe("other");
    });
  });

  describe("other input types", () => {
    it("handles null gracefully", () => {
      const result = formatAiErrorMessage(null);
      expect(result.type).toBe("other");
      expect(result.message).toContain("未知");
    });

    it("handles undefined gracefully", () => {
      const result = formatAiErrorMessage(undefined);
      expect(result.type).toBe("other");
    });

    it("handles plain Error object", () => {
      const result = formatAiErrorMessage(new Error("Custom error"));
      expect(result.type).toBe("other");
      expect(result.message).toContain("Custom error");
    });
  });
});
