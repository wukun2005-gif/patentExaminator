import { describe, it, expect } from "vitest";

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
