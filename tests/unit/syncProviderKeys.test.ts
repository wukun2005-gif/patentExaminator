/**
 * syncProviderKeys Tests (B-038 rewritten)
 * =========================================
 *
 * 测试 syncProviderKeys 功能（通过 settingsSlice.setSettings 触发）：
 * - 正常同步成功
 * - 服务器不可达时错误传播
 * - 部分 provider 同步失败
 * - HTTP 错误响应处理
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock serverReady
vi.mock("@client/lib/serverReady", () => ({
  waitForServerReady: vi.fn().mockResolvedValue(undefined),
  clearServerReadyCache: vi.fn()
}));

// Mock idbWriteGuard
vi.mock("@client/lib/idbWriteGuard", () => ({
  idbWriteGuard: vi.fn(() => vi.fn())
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { useSettingsStore } from "@client/store/features/settings/settingsSlice";
import type { AppSettings } from "@shared/types/agents";

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
    enableProviderFallback: true,
    ...overrides
  };
}

describe("syncProviderKeys (via setSettings)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: "OK", json: () => Promise.resolve({ ok: true }) });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 正常同步成功
  // ══════════════════════════════════════════════════════════════════════

  it("syncs all enabled providers successfully", async () => {
    const settings = makeSettings();
    useSettingsStore.getState().setSettings(settings);
    await new Promise((r) => setTimeout(r, 50));

    const providerCalls = mockFetch.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && c[0].includes("/api/settings/providers/")
    );
    expect(providerCalls).toHaveLength(2);
    expect(providerCalls[0]![0]).toBe("/api/settings/providers/gemini");
    expect(providerCalls[1]![0]).toBe("/api/settings/providers/mimo");
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

    useSettingsStore.getState().setSettings(settings);
    await new Promise((r) => setTimeout(r, 50));

    const providerCalls = mockFetch.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && c[0].includes("/api/settings/providers/")
    );
    expect(providerCalls).toHaveLength(1);
    expect(providerCalls[0]![0]).toBe("/api/settings/providers/mimo");
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

    useSettingsStore.getState().setSettings(settings);
    await new Promise((r) => setTimeout(r, 50));

    const providerCalls = mockFetch.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && c[0].includes("/api/settings/providers/")
    );
    expect(providerCalls).toHaveLength(1);
    expect(providerCalls[0]![0]).toBe("/api/settings/providers/mimo");
  });

  // ══════════════════════════════════════════════════════════════════════
  // 服务器不可达时错误传播
  // ══════════════════════════════════════════════════════════════════════

  it("handles server unreachable gracefully", async () => {
    mockFetch.mockRejectedValue(new Error("Failed to fetch"));

    const settings = makeSettings();
    expect(() => useSettingsStore.getState().setSettings(settings)).not.toThrow();
    await new Promise((r) => setTimeout(r, 50));
  });

  // ══════════════════════════════════════════════════════════════════════
  // HTTP 错误响应处理
  // ══════════════════════════════════════════════════════════════════════

  it("handles HTTP 500 error gracefully", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: "Internal Server Error", json: () => Promise.resolve({ ok: false }) });

    const settings = makeSettings();
    expect(() => useSettingsStore.getState().setSettings(settings)).not.toThrow();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("handles HTTP 401 error gracefully", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized", json: () => Promise.resolve({ ok: false }) });

    const settings = makeSettings();
    expect(() => useSettingsStore.getState().setSettings(settings)).not.toThrow();
    await new Promise((r) => setTimeout(r, 50));
  });

  // ══════════════════════════════════════════════════════════════════════
  // 部分 provider 同步失败
  // ══════════════════════════════════════════════════════════════════════

  it("handles partial failure when some providers fail", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/data/settings")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
      }
      if (url.includes("/api/settings/providers/gemini")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
      }
      return Promise.resolve({ ok: false, status: 503, statusText: "Service Unavailable", json: () => Promise.resolve({ ok: false }) });
    });

    const settings = makeSettings();
    expect(() => useSettingsStore.getState().setSettings(settings)).not.toThrow();
    await new Promise((r) => setTimeout(r, 50));

    const providerCalls = mockFetch.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && c[0].includes("/api/settings/providers/")
    );
    expect(providerCalls).toHaveLength(2);
  });

  // ══════════════════════════════════════════════════════════════════════
  // 边界情况
  // ══════════════════════════════════════════════════════════════════════

  it("handles empty providers list", async () => {
    const settings = makeSettings({ providers: [] });
    useSettingsStore.getState().setSettings(settings);
    await new Promise((r) => setTimeout(r, 50));

    const providerCalls = mockFetch.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && c[0].includes("/api/settings/providers/")
    );
    expect(providerCalls).toHaveLength(0);
  });

  // ══════════════════════════════════════════════════════════════════════
  // API 调用验证
  // ══════════════════════════════════════════════════════════════════════

  it("sends correct API request format", async () => {
    const settings = makeSettings();
    useSettingsStore.getState().setSettings(settings);
    await new Promise((r) => setTimeout(r, 50));

    const geminiCall = mockFetch.mock.calls.find(
      (c: unknown[]) => c[0] === "/api/settings/providers/gemini"
    );
    expect(geminiCall).toBeDefined();
    expect(geminiCall![1]).toMatchObject({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "test-key-1" })
    });

    const mimoCall = mockFetch.mock.calls.find(
      (c: unknown[]) => c[0] === "/api/settings/providers/mimo"
    );
    expect(mimoCall).toBeDefined();
    expect(mimoCall![1]).toMatchObject({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "test-key-2" })
    });
  });

  it("does not sync when mode is mock", async () => {
    const settings = makeSettings({ mode: "mock" });
    useSettingsStore.getState().setSettings(settings);
    await new Promise((r) => setTimeout(r, 50));

    const providerCalls = mockFetch.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && c[0].includes("/api/settings/providers/")
    );
    expect(providerCalls).toHaveLength(0);
  });
});
