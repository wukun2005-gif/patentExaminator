import { useState, useRef } from "react";
import type { ProviderConnection, ProviderId } from "@shared/types/agents";
import { useSettingsStore } from "../../store";
import { fetchModels } from "../../lib/api";

const PROVIDER_OPTIONS: Array<{ id: ProviderId; name: string; desc: string }> = [
  { id: "gemini", name: "Gemini", desc: "Google AI Studio (免费)" },
  { id: "mimo", name: "MiMo", desc: "小米 Token Plan" },
  { id: "kimi", name: "Kimi", desc: "Moonshot / 月之暗面" },
  { id: "glm", name: "GLM", desc: "智谱 AI" },
  { id: "minimax", name: "MiniMax", desc: "MiniMax" },
  { id: "deepseek", name: "DeepSeek", desc: "深度求索" }
];

const DEFAULT_MODELS: Record<ProviderId, string[]> = {
  gemini: ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"],
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
  const [loadingModels, setLoadingModels] = useState<string | null>(null);
  const [modelError, setModelError] = useState<Record<string, string>>({});
  const dragItem = useRef<{ providerId: string; index: number } | null>(null);
  const dragOverItem = useRef<{ providerId: string; index: number } | null>(null);

  const updateProvider = (id: string, patch: Partial<ProviderConnection>) => {
    setSettings({
      ...settings,
      providers: settings.providers.map((p) =>
        p.providerId === id ? { ...p, ...patch } : p
      )
    });
  };

  const handleAdd = (id: ProviderId) => {
    if (settings.providers.some((p) => p.providerId === id)) return;
    const models = DEFAULT_MODELS[id];
    const conn: ProviderConnection = {
      providerId: id,
      apiKeyRef: "",
      modelIds: models,
      defaultModelId: models[0] ?? "",
      modelFallbacks: models,
      enabled: true
    };
    setSettings({ ...settings, providers: [...settings.providers, conn] });
  };

  const handleRemove = (id: string) => {
    setSettings({ ...settings, providers: settings.providers.filter((p) => p.providerId !== id) });
  };

  const handleToggle = (id: string) => {
    updateProvider(id, { enabled: !settings.providers.find((p) => p.providerId === id)?.enabled });
  };

  const handleSelectDefault = (providerId: string, modelId: string) => {
    const provider = settings.providers.find((p) => p.providerId === providerId);
    if (!provider) return;
    // Move selected model to front of fallbacks
    const fallbacks = (provider.modelFallbacks ?? provider.modelIds).filter((m) => m !== modelId);
    updateProvider(providerId, {
      defaultModelId: modelId,
      modelFallbacks: [modelId, ...fallbacks]
    });
  };

  const handleDragStart = (providerId: string, index: number) => {
    dragItem.current = { providerId, index };
  };

  const handleDragOver = (e: React.DragEvent, providerId: string, index: number) => {
    e.preventDefault();
    dragOverItem.current = { providerId, index };
  };

  const handleDrop = (providerId: string) => {
    if (!dragItem.current || !dragOverItem.current) return;
    if (dragItem.current.providerId !== providerId) return;
    if (dragItem.current.index === dragOverItem.current.index) return;

    const provider = settings.providers.find((p) => p.providerId === providerId);
    if (!provider) return;

    const list = [...(provider.modelFallbacks ?? provider.modelIds)];
    const fromIndex = dragItem.current.index;
    const toIndex = dragOverItem.current.index;
    const [moved] = list.splice(fromIndex, 1);
    if (moved !== undefined) {
      list.splice(toIndex, 0, moved);
    }

    updateProvider(providerId, { modelFallbacks: list });
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const handleDragEnd = () => {
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const handleSaveKey = (id: string) => {
    updateProvider(id, { apiKeyRef: keyInput });
    setEditingKey(null);
    setKeyInput("");
  };

  const handleQueryModels = async (id: string) => {
    const provider = settings.providers.find((p) => p.providerId === id);
    if (!provider?.apiKeyRef) return;
    setLoadingModels(id);
    setModelError((prev) => ({ ...prev, [id]: "" }));
    try {
      const models = await fetchModels(id, provider.apiKeyRef);
      if (models.length > 0) {
        const defaultId = models.includes(provider.defaultModelId)
          ? provider.defaultModelId
          : models[0]!;
        const fallbacks = [defaultId, ...models.filter((m) => m !== defaultId)];
        updateProvider(id, { modelIds: models, defaultModelId: defaultId, modelFallbacks: fallbacks });
      }
    } catch (error) {
      setModelError((prev) => ({ ...prev, [id]: error instanceof Error ? error.message : "查询失败" }));
    } finally {
      setLoadingModels(null);
    }
  };

  const available = PROVIDER_OPTIONS.filter(
    (opt) => !settings.providers.some((p) => p.providerId === opt.id)
  );

  return (
    <div className="providers-config-panel" data-testid="providers-config-panel">
      <p className="panel-desc">
        添加 AI 服务商并填入 API Key，然后查询可用模型。切换到「真实模式」后，系统会通过这些连接调用大模型。
      </p>

      <div className="provider-cards">
        {settings.providers.map((provider) => {
          const info = PROVIDER_OPTIONS.find((o) => o.id === provider.providerId);
          const isLoading = loadingModels === provider.providerId;
          const error = modelError[provider.providerId];
          const fallbackList = provider.modelFallbacks ?? provider.modelIds;
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

                {provider.apiKeyRef && (
                  <div className="provider-card__field">
                    <label>可用模型</label>
                    <button
                      type="button"
                      className="btn-text"
                      onClick={() => handleQueryModels(provider.providerId)}
                      disabled={isLoading}
                      data-testid={`btn-query-models-${provider.providerId}`}
                    >
                      {isLoading ? "查询中…" : "查询可用模型"}
                    </button>
                  </div>
                )}

                {error && (
                  <div className="provider-card__field">
                    <label />
                    <span className="text-error">{error}</span>
                  </div>
                )}

                {fallbackList.length > 0 && (
                  <div className="provider-card__field provider-card__field--fallback">
                    <label>默认模型</label>
                    <div className="fallback-table-wrap">
                      <table className="fallback-table" data-testid={`fallback-table-${provider.providerId}`}>
                        <thead>
                          <tr>
                            <th className="fallback-table__handle-col" />
                            <th className="fallback-table__seq-col">#</th>
                            <th>模型</th>
                            <th className="fallback-table__action-col" />
                          </tr>
                        </thead>
                        <tbody>
                          {fallbackList.map((model, i) => {
                            const isDefault = model === provider.defaultModelId;
                            return (
                              <tr
                                key={model}
                                className={`fallback-model-row ${isDefault ? "fallback-model-row--selected" : ""}`}
                                draggable
                                onDragStart={() => handleDragStart(provider.providerId, i)}
                                onDragOver={(e) => handleDragOver(e, provider.providerId, i)}
                                onDrop={() => handleDrop(provider.providerId)}
                                onDragEnd={handleDragEnd}
                                data-testid={`fallback-row-${provider.providerId}-${i}`}
                              >
                                <td className="fallback-table__handle-col">
                                  <span className="drag-handle" aria-label="拖拽排序">⠿</span>
                                </td>
                                <td className="fallback-table__seq-col">{i + 1}</td>
                                <td>
                                  <span className="fallback-model-name">
                                    {model}
                                    {isDefault && <span className="fallback-current-badge">当前默认</span>}
                                  </span>
                                </td>
                                <td className="fallback-table__action-col">
                                  {!isDefault && (
                                    <button
                                      type="button"
                                      className="btn-text"
                                      onClick={() => handleSelectDefault(provider.providerId, model)}
                                      data-testid={`btn-select-default-${provider.providerId}-${i}`}
                                    >
                                      设为默认
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
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
