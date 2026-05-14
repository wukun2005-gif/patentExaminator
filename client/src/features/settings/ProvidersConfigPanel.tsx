import { useState, useRef } from "react";
import type { ProviderConnection, ProviderId } from "@shared/types/agents";
import { PRESET_MODEL_PROVIDERS } from "@shared/types/agents";
import { useSettingsStore } from "../../store";
import { fetchModels } from "../../lib/api";
import { DEFAULT_MODELS, getModelMeta } from "../../lib/modelCatalog";

export function ProvidersConfigPanel() {
  const { settings, setSettings } = useSettingsStore();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [loadingModels, setLoadingModels] = useState<string | null>(null);
  const [modelError, setModelError] = useState<Record<string, string>>({});
  const dragItem = useRef<{ providerId: string; index: number } | null>(null);
  const dragOverItem = useRef<{ providerId: string; index: number } | null>(null);

  const getProvider = (id: ProviderId): ProviderConnection | undefined =>
    settings.providers.find((p) => p.providerId === id);

  const ensureProvider = (id: ProviderId): ProviderConnection => {
    const existing = getProvider(id);
    if (existing) return existing;
    const models = DEFAULT_MODELS[id as ProviderId].map((model: { id: string }) => model.id);
    return {
      providerId: id,
      apiKeyRef: "",
      modelIds: models,
      defaultModelId: models[0] ?? "",
      modelFallbacks: models,
      enabled: false
    };
  };

  const updateProvider = (id: string, patch: Partial<ProviderConnection>) => {
    const existing = settings.providers.find((p) => p.providerId === id);
    if (existing) {
      setSettings({
        ...settings,
        providers: settings.providers.map((p) =>
          p.providerId === id ? { ...p, ...patch } : p
        )
      });
    } else {
      const preset = PRESET_MODEL_PROVIDERS.find((p) => p.id === id);
      if (!preset) return;
      const models = DEFAULT_MODELS[id as ProviderId].map((model: { id: string }) => model.id);
      const conn: ProviderConnection = {
        providerId: id as ProviderId,
        apiKeyRef: "",
        modelIds: models,
        defaultModelId: models[0] ?? "",
        modelFallbacks: models,
        enabled: false,
        ...patch
      };
      setSettings({ ...settings, providers: [...settings.providers, conn] });
    }
  };

  const handleToggle = (id: string) => {
    const provider = ensureProvider(id as ProviderId);
    updateProvider(id, { enabled: !provider.enabled });
  };

  const handleSelectDefault = (providerId: string, modelId: string) => {
    const provider = ensureProvider(providerId as ProviderId);
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

    const provider = ensureProvider(providerId as ProviderId);
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
    const provider = ensureProvider(id as ProviderId);
    if (!provider.apiKeyRef) return;
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

  return (
    <div className="providers-config-panel" data-testid="providers-config-panel">
      <p className="panel-desc">
        配置 AI 服务商的 API Key 以启用模型连接。服务商列表由系统预置，不可自行添加。
      </p>

      <div className="provider-cards">
        {PRESET_MODEL_PROVIDERS.map((preset) => {
          const provider = ensureProvider(preset.id);
          const isLoading = loadingModels === preset.id;
          const error = modelError[preset.id];
          const fallbackList = provider.modelFallbacks ?? provider.modelIds;
          const modelMetaMap = new Map(
            fallbackList.map((id) => [id, getModelMeta(preset.id, id)])
          );
          return (
            <div
              key={preset.id}
              className={`provider-card ${provider.enabled ? "" : "provider-card--disabled"}`}
              data-testid={`provider-${preset.id}`}
            >
              <div className="provider-card__header">
                <div>
                  <strong>{preset.displayName}</strong>
                  <span className="provider-card__desc">{preset.desc}</span>
                </div>
                <div className="provider-card__actions">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={provider.enabled}
                      onChange={() => handleToggle(preset.id)}
                      data-testid={`toggle-${preset.id}`}
                    />
                    启用
                  </label>
                </div>
              </div>

              <div className="provider-card__body">
                <div className="provider-card__field">
                  <label>Base URL</label>
                  <input
                    type="text"
                    value={preset.baseUrl}
                    readOnly
                    disabled
                    className="input-readonly"
                    data-testid={`baseurl-${preset.id}`}
                  />
                </div>

                <div className="provider-card__field">
                  <label>API Key</label>
                  {editingKey === preset.id ? (
                    <div className="inline-edit">
                      <input
                        type="password"
                        value={keyInput}
                        onChange={(e) => setKeyInput(e.target.value)}
                        placeholder={preset.keyPlaceholder}
                        data-testid={`input-api-key-${preset.id}`}
                        autoFocus
                      />
                      <button type="button" onClick={() => handleSaveKey(preset.id)}>
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
                        onClick={() => { setEditingKey(preset.id); setKeyInput(provider.apiKeyRef); }}
                        data-testid={`btn-edit-key-${preset.id}`}
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
                      onClick={() => handleQueryModels(preset.id)}
                      disabled={isLoading}
                      data-testid={`btn-query-models-${preset.id}`}
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
                      <table className="fallback-table" data-testid={`fallback-table-${preset.id}`}>
                        <thead>
                          <tr>
                            <th className="fallback-table__handle-col" />
                            <th className="fallback-table__seq-col">#</th>
                            <th>模型</th>
                            <th>推荐场景</th>
                            <th>配额</th>
                            <th className="fallback-table__action-col" />
                          </tr>
                        </thead>
                        <tbody>
                          {fallbackList.map((model, i) => {
                            const isDefault = model === provider.defaultModelId;
                            const meta = modelMetaMap.get(model);
                            return (
                              <tr
                                key={model}
                                className={`fallback-model-row ${isDefault ? "fallback-model-row--selected" : ""}`}
                                draggable
                                onDragStart={() => handleDragStart(preset.id, i)}
                                onDragOver={(e) => handleDragOver(e, preset.id, i)}
                                onDrop={() => handleDrop(preset.id)}
                                onDragEnd={handleDragEnd}
                                data-testid={`fallback-row-${preset.id}-${i}`}
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
                                <td className="fallback-table__meta-col">
                                  {meta?.recommendation ?? "—"}
                                </td>
                                <td className="fallback-table__meta-col">
                                  {meta ? `RPM ${meta.rpm ?? "?"} / RPD ${meta.rpd ?? "?"} / TPM ${meta.tpm ?? "?"}` : "—"}
                                </td>
                                <td className="fallback-table__action-col">
                                  {!isDefault && (
                                    <button
                                      type="button"
                                      className="btn-text"
                                      onClick={() => handleSelectDefault(preset.id, model)}
                                      data-testid={`btn-select-default-${preset.id}-${i}`}
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
    </div>
  );
}