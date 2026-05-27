/**
 * syncProviderKeys Tests
 * ======================
 *
 * 测试 syncProviderKeys 函数的各种场景：
 * - 正常同步成功
 * - 服务器不可达时错误传播
 * - 部分 provider 同步失败
 * - HTTP 错误响应处理
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncProviderKeys } from "@client/lib/repositories/settingsRepo";
import type { AppSettings } from "@shared/types/agents";

// Mock waitForServerReady
vi.mock("@client/lib/serverReady", () => ({
  waitForServerReady: vi.fn().mockResolvedValue(undefined)
}));

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    mode: "real",
    guidelineVersion: "2023",
    providers: [
      {
        providerId: "gemini",
        apiKeyRef: "test-key-1",
        modelIds: ["gemini-2.5-flash-lite"],
        defaultModelId: "gemini-2.5-flash-lite",
        enabled: true
      },
      {
        providerId: "mimo",
        apiKeyRef: "test-key-2",
        modelIds: ["mimo-v2.5-pro"],
        defaultModelId: "mimo-v2.5-pro",
        enabled: true
      }
    ],
    agents: [],
    searchProviders: [],
    persistKeysEncrypted: false,
    enableProviderFallback: true,
    ...overrides
  };
}

describe("syncProviderKeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 正常同步成功
  // ══════════════════════════════════════════════════════════════════════

  it("syncs all enabled providers successfully", async () => {
    const settings = makeSettings();
    const result = await syncProviderKeys(settings);

    expect(result.success).toBe(true);
    expect(result.syncedProviders).toEqual(["gemini", "mimo"]);
    expect(result.failedProviders).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("skips disabled providers", async () => {
    const settings = makeSettings({
      providers: [
        {
          providerId: "gemini",
          apiKeyRef: "test-key",
          modelIds: ["gemini-2.5-flash-lite"],
          defaultModelId: "gemini-2.5-flash-lite",
          enabled: false
        },
        {
          providerId: "mimo",
          apiKeyRef: "test-key",
          modelIds: ["mimo-v2.5-pro"],
          defaultModelId: "mimo-v2.5-pro",
          enabled: true
        }
      ]
    });

    const result = await syncProviderKeys(settings);

    expect(result.success).toBe(true);
    expect(result.syncedProviders).toEqual(["mimo"]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("skips providers without apiKeyRef", async () => {
    const settings = makeSettings({
      providers: [
        {
          providerId: "gemini",
          apiKeyRef: "",
          modelIds: ["gemini-2.5-flash-lite"],
          defaultModelId: "gemini-2.5-flash-lite",
          enabled: true
        },
        {
          providerId: "mimo",
          apiKeyRef: "test-key",
          modelIds: ["mimo-v2.5-pro"],
          defaultModelId: "mimo-v2.5-pro",
          enabled: true
        }
      ]
    });

    const result = await syncProviderKeys(settings);

    expect(result.success).toBe(true);
    expect(result.syncedProviders).toEqual(["mimo"]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // ══════════════════════════════════════════════════════════════════════
  // 服务器不可达时错误传播
  // ══════════════════════════════════════════════════════════════════════

  it("returns failure when server is unreachable", async () => {
    mockFetch.mockRejectedValue(new Error("Failed to fetch"));

    const settings = makeSettings();
    const result = await syncProviderKeys(settings);

    expect(result.success).toBe(false);
    expect(result.syncedProviders).toEqual([]);
    expect(result.failedProviders).toHaveLength(2);
    expect(result.failedProviders[0]!.providerId).toBe("gemini");
    expect(result.failedProviders[0]!.error).toBe("Failed to fetch");
  });

  it("returns failure when network error occurs", async () => {
    mockFetch.mockRejectedValue(new Error("NetworkError: net::ERR_CONNECTION_REFUSED"));

    const settings = makeSettings();
    const result = await syncProviderKeys(settings);

    expect(result.success).toBe(false);
    expect(result.failedProviders[0]!.error).toContain("NetworkError");
  });

  // ══════════════════════════════════════════════════════════════════════
  // HTTP 错误响应处理
  // ══════════════════════════════════════════════════════════════════════

  it("handles HTTP 500 error", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: "Internal Server Error" });

    const settings = makeSettings();
    const result = await syncProviderKeys(settings);

    expect(result.success).toBe(false);
    expect(result.failedProviders).toHaveLength(2);
    expect(result.failedProviders[0]!.error).toContain("HTTP 500");
  });

  it("handles HTTP 401 error", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" });

    const settings = makeSettings();
    const result = await syncProviderKeys(settings);

    expect(result.success).toBe(false);
    expect(result.failedProviders[0]!.error).toContain("HTTP 401");
  });

  // ══════════════════════════════════════════════════════════════════════
  // 部分 provider 同步失败
  // ══════════════════════════════════════════════════════════════════════

  it("reports partial failure when some providers fail", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: true, status: 200, statusText: "OK" });
      }
      return Promise.reject(new Error("Server unavailable"));
    });

    const settings = makeSettings();
    const result = await syncProviderKeys(settings);

    expect(result.success).toBe(false);
    expect(result.syncedProviders).toEqual(["gemini"]);
    expect(result.failedProviders).toHaveLength(1);
    expect(result.failedProviders[0]!.providerId).toBe("mimo");
    expect(result.failedProviders[0]!.error).toBe("Server unavailable");
  });

  it("reports partial failure when some HTTP responses fail", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: true, status: 200, statusText: "OK" });
      }
      return Promise.resolve({ ok: false, status: 503, statusText: "Service Unavailable" });
    });

    const settings = makeSettings();
    const result = await syncProviderKeys(settings);

    expect(result.success).toBe(false);
    expect(result.syncedProviders).toEqual(["gemini"]);
    expect(result.failedProviders).toHaveLength(1);
    expect(result.failedProviders[0]!.providerId).toBe("mimo");
    expect(result.failedProviders[0]!.error).toContain("HTTP 503");
  });

  // ══════════════════════════════════════════════════════════════════════
  // 边界情况
  // ══════════════════════════════════════════════════════════════════════

  it("handles empty providers list", async () => {
    const settings = makeSettings({ providers: [] });
    const result = await syncProviderKeys(settings);

    expect(result.success).toBe(true);
    expect(result.syncedProviders).toEqual([]);
    expect(result.failedProviders).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("handles non-Error exceptions", async () => {
    mockFetch.mockRejectedValue("string error");

    const settings = makeSettings();
    const result = await syncProviderKeys(settings);

    expect(result.success).toBe(false);
    expect(result.failedProviders[0]!.error).toBe("string error");
  });

  // ══════════════════════════════════════════════════════════════════════
  // API 调用验证
  // ══════════════════════════════════════════════════════════════════════

  it("sends correct API request format", async () => {
    const settings = makeSettings();
    await syncProviderKeys(settings);

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/settings/providers/gemini",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: "test-key-1" })
      }
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/settings/providers/mimo",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: "test-key-2" })
      }
    );
  });
});
