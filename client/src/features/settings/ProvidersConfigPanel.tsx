import { useState } from "react";
import type { ProviderConnection, ProviderId } from "@shared/types/agents";
import { useSettingsStore } from "../../store";

const PROVIDER_OPTIONS: Array<{ id: ProviderId; name: string }> = [
  { id: "mimo", name: "MiMo (Token Plan)" },
  { id: "kimi", name: "Kimi (Moonshot)" },
  { id: "glm", name: "GLM (智谱)" },
  { id: "minimax", name: "Minimax" },
  { id: "deepseek", name: "Deepseek" }
];

export function ProvidersConfigPanel() {
  const { settings, setSettings } = useSettingsStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");

  const handleAddProvider = (providerId: ProviderId) => {
    const existing = settings.providers.find((p) => p.providerId === providerId);
    if (existing) return;

    const newProvider: ProviderConnection = {
      providerId,
      apiKeyRef: "",
      modelIds: getDefaultModels(providerId),
      enabled: true
    };

    setSettings({
      ...settings,
      providers: [...settings.providers, newProvider]
    });
  };

  const handleRemoveProvider = (providerId: string) => {
    setSettings({
      ...settings,
      providers: settings.providers.filter((p) => p.providerId !== providerId)
    });
  };

  const handleToggleEnabled = (providerId: string) => {
    setSettings({
      ...settings,
      providers: settings.providers.map((p) =>
        p.providerId === providerId ? { ...p, enabled: !p.enabled } : p
      )
    });
  };

  const handleSaveApiKey = (providerId: string) => {
    setSettings({
      ...settings,
      providers: settings.providers.map((p) =>
        p.providerId === providerId ? { ...p, apiKeyRef: apiKeyInput } : p
      )
    });
    setEditingId(null);
    setApiKeyInput("");
  };

  const availableToAdd = PROVIDER_OPTIONS.filter(
    (opt) => !settings.providers.some((p) => p.providerId === opt.id)
  );

  return (
    <div className="providers-config-panel" data-testid="providers-config-panel">
      <h3>模型连接配置</h3>

      <div className="provider-list">
        {settings.providers.map((provider) => (
          <div
            key={provider.providerId}
            className="provider-item"
            data-testid={`provider-${provider.providerId}`}
          >
            <div className="provider-header">
              <span className="provider-name">
                {PROVIDER_OPTIONS.find((o) => o.id === provider.providerId)?.name ?? provider.providerId}
              </span>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={provider.enabled}
                  onChange={() => handleToggleEnabled(provider.providerId)}
                  data-testid={`toggle-${provider.providerId}`}
                />
                启用
              </label>
            </div>

            <div className="provider-details">
              {editingId === provider.providerId ? (
                <div className="api-key-edit">
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="输入 API Key"
                    data-testid={`input-api-key-${provider.providerId}`}
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveApiKey(provider.providerId)}
                    data-testid={`btn-save-key-${provider.providerId}`}
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setApiKeyInput("");
                    }}
                  >
                    取消
                  </button>
                </div>
              ) : (
                <div className="api-key-display">
                  <span>
                    API Key: {provider.apiKeyRef ? "已配置" : "未配置"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(provider.providerId);
                      setApiKeyInput(provider.apiKeyRef);
                    }}
                    data-testid={`btn-edit-key-${provider.providerId}`}
                  >
                    {provider.apiKeyRef ? "修改" : "配置"}
                  </button>
                </div>
              )}

              <div className="model-list">
                <span>模型: {provider.modelIds.join(", ")}</span>
              </div>

              <button
                type="button"
                onClick={() => handleRemoveProvider(provider.providerId)}
                data-testid={`btn-remove-${provider.providerId}`}
                className="remove-btn"
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>

      {availableToAdd.length > 0 && (
        <div className="add-provider">
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) handleAddProvider(e.target.value as ProviderId);
            }}
            data-testid="select-add-provider"
          >
            <option value="">— 添加 Provider —</option>
            {availableToAdd.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function getDefaultModels(providerId: ProviderId): string[] {
  const defaults: Record<ProviderId, string[]> = {
    mimo: ["MiMo-V2.5-Pro"],
    kimi: ["moonshot-v1-128k"],
    glm: ["glm-4-plus"],
    minimax: ["abab6.5s-chat"],
    deepseek: ["deepseek-chat"]
  };
  return defaults[providerId] ?? [];
}
