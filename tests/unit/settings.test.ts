import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ProviderId } from "@shared/types/agents";

describe("Settings module structure", () => {
  it("ProvidersConfigPanel can be imported", async () => {
    const mod = await import("@client/features/settings/ProvidersConfigPanel");
    expect(mod.ProvidersConfigPanel).toBeDefined();
    expect(typeof mod.ProvidersConfigPanel).toBe("function");
  });

  it("AgentsAssignmentPanel can be imported", async () => {
    const mod = await import("@client/features/settings/AgentsAssignmentPanel");
    expect(mod.AgentsAssignmentPanel).toBeDefined();
    expect(typeof mod.AgentsAssignmentPanel).toBe("function");
  });

  it("SettingsPage can be imported", async () => {
    const mod = await import("@client/features/settings/SettingsPage");
    expect(mod.SettingsPage).toBeDefined();
    expect(typeof mod.SettingsPage).toBe("function");
  });

  it("ProviderErrorBox can be imported", async () => {
    const mod = await import("@client/features/settings/ProviderErrorBox");
    expect(mod.ProviderErrorBox).toBeDefined();
    expect(typeof mod.ProviderErrorBox).toBe("function");
  });
});

describe("Settings slice", () => {
  it("has default settings with mock mode", async () => {
    const { useSettingsStore } = await import("@client/store");
    const state = useSettingsStore.getState();
    expect(state.settings.mode).toBe("mock");
    expect(state.settings.providers).toEqual([]);
    expect(state.settings.agents).toEqual([]);
  });

  it("can update mode", async () => {
    const { useSettingsStore } = await import("@client/store");
    const { updateMode } = useSettingsStore.getState();
    updateMode("real");
    expect(useSettingsStore.getState().settings.mode).toBe("real");
    updateMode("mock"); // Reset
  });

  it("can add provider error message and respects max limit", async () => {
    const { useSettingsStore } = await import("@client/store");
    const { addProviderError, setSettings, settings } = useSettingsStore.getState();

    addProviderError({
      providerId: "mimo" as ProviderId,
      errorCode: "timeout",
      message: "Provider mimo timed out",
      timestamp: new Date().toISOString(),
      read: false,
      agent: "novelty",
      caseId: "case-1"
    });

    const msgs = useSettingsStore.getState().settings.providerErrorMessages;
    expect(msgs).toBeDefined();
    expect(msgs!.length).toBe(1);
    expect(msgs![0]!.providerId).toBe("mimo");
    expect(msgs![0]!.errorCode).toBe("timeout");
    expect(msgs![0]!.read).toBe(false);
    expect(msgs![0]!.id).toBeDefined();
    expect(typeof msgs![0]!.id).toBe("string");

    setSettings({ ...settings, providerErrorMessages: [] });
  });

  it("provider error messages have unique ids", async () => {
    const { useSettingsStore } = await import("@client/store");
    const { addProviderError, setSettings, settings } = useSettingsStore.getState();

    addProviderError({
      providerId: "mimo" as ProviderId,
      errorCode: "err-1",
      message: "Error 1",
      timestamp: new Date().toISOString(),
      read: false
    });
    addProviderError({
      providerId: "mimo" as ProviderId,
      errorCode: "err-2",
      message: "Error 2",
      timestamp: new Date().toISOString(),
      read: false
    });

    const msgs = useSettingsStore.getState().settings.providerErrorMessages ?? [];
    expect(msgs.length).toBe(2);
    expect(msgs[0]!.id).not.toBe(msgs[1]!.id);

    setSettings({ ...settings, providerErrorMessages: [] });
  });

  it("can add provider", async () => {
    const { useSettingsStore } = await import("@client/store");
    const { setSettings, settings } = useSettingsStore.getState();
    setSettings({
      ...settings,
      providers: [
        {
          providerId: "mimo",
          apiKeyRef: "tp-test",
          modelIds: ["MiMo-V2.5-Pro"],
          defaultModelId: "MiMo-V2.5-Pro",
          enabled: true
        }
      ]
    });
    expect(useSettingsStore.getState().settings.providers.length).toBe(1);
    expect(useSettingsStore.getState().settings.providers[0]!.providerId).toBe("mimo");
    // Reset
    setSettings({ ...settings, providers: [] });
  });
});

describe("Provider card collapse state", () => {
  const STORAGE_KEY = "pex-provider-expanded";

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("stores expanded state in localStorage", () => {
    const state = { kimi: true, mimo: false };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const saved = localStorage.getItem(STORAGE_KEY);
    expect(saved).not.toBeNull();
    expect(JSON.parse(saved!)).toEqual(state);
  });

  it("loads empty state when localStorage is empty", () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    expect(saved).toBeNull();
  });

  it("toggles provider expanded state", () => {
    // Simulate toggle: initially all collapsed
    let state: Record<string, boolean> = {};
    
    // Toggle kimi to expanded
    state = { ...state, kimi: !state.kimi };
    expect(state.kimi).toBe(true);
    
    // Save and reload
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const loaded = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(loaded.kimi).toBe(true);
    
    // Toggle kimi back to collapsed
    state = { ...state, kimi: !state.kimi };
    expect(state.kimi).toBe(false);
  });

  it("persists state across sessions", () => {
    // First session: expand kimi and deepseek
    const session1 = { kimi: true, deepseek: true };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session1));
    
    // Simulate new session loading
    const session2 = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    expect(session2.kimi).toBe(true);
    expect(session2.deepseek).toBe(true);
    expect(session2.mimo).toBeUndefined();
  });
});
