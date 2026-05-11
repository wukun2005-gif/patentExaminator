import { useState } from "react";
import type { ProviderConnection, ProviderId } from "@shared/types/agents";
import { useSettingsStore } from "../../store";

const PROVIDER_OPTIONS: Array<{ id: ProviderId; name: string; desc: string }> = [
  { id: "mimo", name: "MiMo", desc: "小米 Token Plan" },
  { id: "kimi", name: "Kimi", desc: "Moonshot / 月之暗面" },
  { id: "glm", name: "GLM", desc: "智谱 AI" },
  { id: "minimax", name: "MiniMax", desc: "MiniMax" },
  { id: "deepseek", name: "DeepSeek", desc: "深度求索" }
];

const DEFAULT_MODELS: Record<ProviderId, string[]> = {
  mimo: ["MiMo-V2.5-Pro", "MiMo-V2.5", "MiMo-V2-Pro", "MiMo-V2-Omni"],
  kimi: ["moonshot-v1-128k", "moonshot-v1-32k"],
  glm: ["glm-4-plus", "glm-4", "glm-4-long"],
  minimax: ["abab6.5s-chat", "abab6.5-chat"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"]
};

export function ProvidersConfigPanel() {
  const { settings, setSettings } = useSettingsStore();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");

  const handleAdd = (id: ProviderId) => {
    if (settings.providers.some((p) => p.providerId === id)) return;
    const conn: ProviderConnection = {
      providerId: id,
      apiKeyRef: "",
      modelIds: DEFAULT_MODELS[id],
      enabled: true
    };
    setSettings({ ...settings, providers: [...settings.providers, conn] });
  };

  const handleRemove = (id: string) => {
    setSettings({ ...settings, providers: settings.providers.filter((p) => p.providerId !== id) });
  };

  const handleToggle = (id: string) => {
    setSettings({
      ...settings,
      providers: settings.providers.map((p) =>
        p.providerId === id ? { ...p, enabled: !p.enabled } : p
      )
    });
  };

  const handleSaveKey = (id: string) => {
    setSettings({
      ...settings,
      providers: settings.providers.map((p) =>
        p.providerId === id ? { ...p, apiKeyRef: keyInput } : p
      )
    });
    setEditingKey(null);
    setKeyInput("");
  };

  const available = PROVIDER_OPTIONS.filter(
    (opt) => !settings.providers.some((p) => p.providerId === opt.id)
  );

  return (
    <div className="providers-config-panel" data-testid="providers-config-panel">
      <p className="panel-desc">
        添加 AI 服务商并填入 API Key。切换到「真实模式」后，系统会通过这些连接调用大模型。
      </p>

      <div className="provider-cards">
        {settings.providers.map((provider) => {
          const info = PROVIDER_OPTIONS.find((o) => o.id === provider.providerId);
          return (
            <div
              key={provider.providerId}
              className={`provider-card ${provider.enabled ? "" : "provider-card--disabled"}`}
              data-testid={`provider-${provider.providerId}`}
            >
              <div className="provider-card__header">
                <div>
                  <strong>{info?.name ?? provider.providerId}</strong>
                  <span className="provider-card__desc">{info?.desc}</span>
                </div>
                <div className="provider-card__actions">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={provider.enabled}
                      onChange={() => handleToggle(provider.providerId)}
                      data-testid={`toggle-${provider.providerId}`}
                    />
                    启用
                  </label>
                  <button
                    type="button"
                    className="btn-text btn-danger"
                    onClick={() => handleRemove(provider.providerId)}
                    data-testid={`btn-remove-${provider.providerId}`}
                  >
                    删除
                  </button>
                </div>
              </div>

              <div className="provider-card__body">
                <div className="provider-card__field">
                  <label>API Key</label>
                  {editingKey === provider.providerId ? (
                    <div className="inline-edit">
                      <input
                        type="password"
                        value={keyInput}
                        onChange={(e) => setKeyInput(e.target.value)}
                        placeholder="sk-..."
                        data-testid={`input-api-key-${provider.providerId}`}
                        autoFocus
                      />
                      <button type="button" onClick={() => handleSaveKey(provider.providerId)}>
                        保存
                      </button>
                      <button type="button" className="btn-text" onClick={() => { setEditingKey(null); setKeyInput(""); }}>
                        取消
                      </button>
                    </div>
                  ) : (
                    <div className="inline-display">
                      <span className={provider.apiKeyRef ? "text-ok" : "text-muted"}>
                        {provider.apiKeyRef ? "已配置" : "未配置"}
                      </span>
                      <button
                        type="button"
                        className="btn-text"
                        onClick={() => { setEditingKey(provider.providerId); setKeyInput(provider.apiKeyRef); }}
                        data-testid={`btn-edit-key-${provider.providerId}`}
                      >
                        {provider.apiKeyRef ? "修改" : "填写"}
                      </button>
                    </div>
                  )}
                </div>

                <div className="provider-card__field">
                  <label>可用模型</label>
                  <span className="text-muted">{provider.modelIds.join("、")}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {available.length > 0 && (
        <div className="add-provider">
          <select
            value=""
            onChange={(e) => { if (e.target.value) handleAdd(e.target.value as ProviderId); }}
            data-testid="select-add-provider"
          >
            <option value="">+ 添加服务商</option>
            {available.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.name} — {opt.desc}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
