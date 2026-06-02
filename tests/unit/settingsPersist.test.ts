/**
 * Settings persistence Tests (B-038 rewritten)
 * =============================================
 *
 * 测试 settings 持久化功能：
 * - loadFromDb 从服务端读取 settings
 * - setSettings 写入 settings 到服务端
 * - enableProviderFallback 字段的读写
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

describe("Settings persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useSettingsStore.setState({
      settings: {
        mode: "mock",
        guidelineVersion: "2023",
        providers: [],
        agents: [],
        searchProviders: [],
        enableProviderFallback: true
      },
      isInitialized: false
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // loadFromDb
  // ══════════════════════════════════════════════════════════════════════

  it("loadFromDb restores settings from server", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        ok: true,
        record: {
          id: "app",
          mode: "real",
          guidelineVersion: "2023",
          providers: [
            {
              providerId: "deepseek",
              apiKeyRef: "ds-key-789",
              modelIds: ["deepseek-chat"],
              defaultModelId: "deepseek-chat",
              enabled: true
            }
          ],
          agents: [],
          enableProviderFallback: true
        }
      })
    });

    await useSettingsStore.getState().loadFromDb();

    const state = useSettingsStore.getState();
    expect(state.settings.mode).toBe("real");
    expect(state.settings.providers).toHaveLength(1);
    expect(state.settings.providers[0]!.apiKeyRef).toBe("ds-key-789");
    expect(state.isInitialized).toBe(true);
  });

  it("loadFromDb returns defaults when server returns 404", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found"
    });

    await useSettingsStore.getState().loadFromDb();

    const state = useSettingsStore.getState();
    expect(state.isInitialized).toBe(true);
    expect(state.settings.mode).toBe("mock");
  });

  // ══════════════════════════════════════════════════════════════════════
  // setSettings
  // ══════════════════════════════════════════════════════════════════════

  it("setSettings persists settings to server", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });

    const newSettings = {
      ...useSettingsStore.getState().settings,
      mode: "real" as const,
      providers: [
        {
          providerId: "mimo" as const,
          apiKeyRef: "test-key-123",
          modelIds: ["MiMo-V2.5-Pro"],
          defaultModelId: "MiMo-V2.5-Pro",
          enabled: true
        }
      ]
    };

    useSettingsStore.getState().setSettings(newSettings);
    await new Promise((r) => setTimeout(r, 50));

    const settingsCalls = mockFetch.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && c[0].includes("/api/data/settings")
    );
    expect(settingsCalls.length).toBeGreaterThan(0);
  });

  // ══════════════════════════════════════════════════════════════════════
  // enableProviderFallback
  // ══════════════════════════════════════════════════════════════════════

  it("loadFromDb reads enableProviderFallback from stored data", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        ok: true,
        record: {
          id: "app",
          mode: "real",
          guidelineVersion: "2023",
          providers: [],
          agents: [],
          enableProviderFallback: false
        }
      })
    });

    await useSettingsStore.getState().loadFromDb();
    expect(useSettingsStore.getState().settings.enableProviderFallback).toBe(false);
  });

  it("loadFromDb defaults enableProviderFallback to true when not stored", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        ok: true,
        record: {
          id: "app",
          mode: "real",
          guidelineVersion: "2023",
          providers: [],
          agents: []
        }
      })
    });

    await useSettingsStore.getState().loadFromDb();
    expect(useSettingsStore.getState().settings.enableProviderFallback).toBe(true);
  });

  it("full cycle preserves enableProviderFallback", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });

    const newSettings = {
      ...useSettingsStore.getState().settings,
      enableProviderFallback: false
    };
    useSettingsStore.getState().setSettings(newSettings);
    await new Promise((r) => setTimeout(r, 50));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        ok: true,
        record: {
          id: "app",
          ...newSettings,
          enableProviderFallback: false
        }
      })
    });

    useSettingsStore.setState({
      settings: { mode: "mock", guidelineVersion: "2023", providers: [], agents: [], searchProviders: [], enableProviderFallback: true },
      isInitialized: false
    });
    await useSettingsStore.getState().loadFromDb();

    expect(useSettingsStore.getState().settings.enableProviderFallback).toBe(false);
  });
});
