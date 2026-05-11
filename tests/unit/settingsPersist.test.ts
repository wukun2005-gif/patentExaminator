import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDb, mockGet, mockPut } = vi.hoisted(() => {
  const store: Record<string, unknown> = {};
  const mockGet = vi.fn(async (_store: string, key: string) => store[key] ?? undefined);
  const mockPut = vi.fn(async (_store: string, value: unknown) => {
    const record = value as { id: string };
    store[record.id] = value;
  });
  const mockDb = { get: mockGet, put: mockPut };
  return { mockDb, mockGet, mockPut, _store: store };
});

vi.mock("@client/lib/indexedDb", () => ({
  getDB: vi.fn().mockResolvedValue(mockDb)
}));

import { readSettings, writeSettings } from "@client/lib/repositories/settingsRepo";
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
        persistKeysEncrypted: false
      },
      isInitialized: false
    });
  });

  it("writeSettings calls IndexedDB put", async () => {
    const settings = {
      mode: "real" as const,
      guidelineVersion: "2023",
      providers: [
        {
          providerId: "mimo" as const,
          apiKeyRef: "test-key-123",
          modelIds: ["MiMo-V2.5-Pro"],
          enabled: true
        }
      ],
      agents: [],
      persistKeysEncrypted: false
    };
    await writeSettings(settings);
    expect(mockPut).toHaveBeenCalledOnce();
    const putArg = mockPut.mock.calls[0][1] as Record<string, unknown>;
    expect(putArg.id).toBe("app");
    expect(putArg.mode).toBe("real");
    expect((putArg.providers as Array<Record<string, unknown>>)[0].apiKeyRef).toBe("test-key-123");
  });

  it("readSettings returns defaults when nothing stored", async () => {
    mockGet.mockResolvedValueOnce(undefined);
    const result = await readSettings();
    expect(result.mode).toBe("mock");
    expect(result.providers.length).toBeGreaterThan(0);
    expect(result.providers[0].providerId).toBe("gemini");
  });

  it("readSettings returns stored settings with providers", async () => {
    mockGet.mockResolvedValueOnce({
      id: "app",
      mode: "real",
      guidelineVersion: "2023",
      providers: [
        {
          providerId: "mimo",
          apiKeyRef: "test-key-123",
          modelIds: ["MiMo-V2.5-Pro"],
          enabled: true
        }
      ],
      agents: [],
      persistKeysEncrypted: false
    });

    const result = await readSettings();
    expect(result.mode).toBe("real");
    expect(result.providers).toHaveLength(1);
    expect(result.providers[0].apiKeyRef).toBe("test-key-123");
  });

  it("setSettings calls writeSettings", async () => {
    const storeState = useSettingsStore.getState();
    const newSettings = {
      ...storeState.settings,
      providers: [
        {
          providerId: "kimi" as const,
          apiKeyRef: "kimi-key-456",
          modelIds: ["moonshot-v1-128k"],
          enabled: true
        }
      ]
    };

    storeState.setSettings(newSettings);
    await new Promise((r) => setTimeout(r, 10));

    expect(mockPut).toHaveBeenCalledOnce();
    const putArg = mockPut.mock.calls[0][1] as Record<string, unknown>;
    expect((putArg.providers as Array<Record<string, unknown>>)[0].apiKeyRef).toBe("kimi-key-456");
  });

  it("loadFromDb restores settings from IndexedDB", async () => {
    mockGet.mockResolvedValueOnce({
      id: "app",
      mode: "real",
      guidelineVersion: "2023",
      providers: [
        {
          providerId: "deepseek",
          apiKeyRef: "ds-key-789",
          modelIds: ["deepseek-chat"],
          enabled: true
        }
      ],
      agents: [],
      persistKeysEncrypted: false
    });

    await useSettingsStore.getState().loadFromDb();

    const state = useSettingsStore.getState();
    expect(state.settings.mode).toBe("real");
    expect(state.settings.providers).toHaveLength(1);
    expect(state.settings.providers[0].apiKeyRef).toBe("ds-key-789");
    expect(state.isInitialized).toBe(true);
  });

  it("full cycle: setSettings → write → read → loadFromDb", async () => {
    // Simulate user setting an API key
    const storeState = useSettingsStore.getState();
    const newSettings = {
      ...storeState.settings,
      providers: [
        {
          providerId: "mimo" as const,
          apiKeyRef: "my-secret-key-abc",
          modelIds: ["MiMo-V2.5-Pro"],
          enabled: true
        }
      ]
    };

    // Step 1: setSettings (updates Zustand + writes to IndexedDB)
    storeState.setSettings(newSettings);
    await new Promise((r) => setTimeout(r, 10));

    // Verify the write happened
    expect(mockPut).toHaveBeenCalledOnce();
    const writtenData = mockPut.mock.calls[0][1] as Record<string, unknown>;

    // Step 2: Simulate page refresh — readSettings returns what was written
    mockGet.mockResolvedValueOnce(writtenData);

    // Step 3: loadFromDb should restore the settings
    useSettingsStore.setState({
      settings: { mode: "mock", guidelineVersion: "2023", providers: [], agents: [], persistKeysEncrypted: false },
      isInitialized: false
    });
    await useSettingsStore.getState().loadFromDb();

    const restored = useSettingsStore.getState();
    expect(restored.settings.providers).toHaveLength(1);
    expect(restored.settings.providers[0].apiKeyRef).toBe("my-secret-key-abc");
    expect(restored.settings.providers[0].providerId).toBe("mimo");
    expect(restored.settings.mode).toBe("mock");
  });
});
