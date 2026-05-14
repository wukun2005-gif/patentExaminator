import { useState } from "react";
import type { SearchProviderConnection, SearchProviderId } from "@shared/types/agents";
import { PRESET_SEARCH_PROVIDERS } from "@shared/types/agents";
import { useSettingsStore } from "../../store";

interface VerifyResult {
  ok: boolean;
  message?: string;
  error?: string;
}

export function SearchProvidersConfigPanel() {
  const { settings, setSettings } = useSettingsStore();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<Record<string, VerifyResult>>({});

  const searchProviders = settings.searchProviders ?? [];

  const getSearchProvider = (id: SearchProviderId): SearchProviderConnection | undefined =>
    searchProviders.find((p) => p.providerId === id);

  const ensureSearchProvider = (id: SearchProviderId): SearchProviderConnection => {
    const existing = getSearchProvider(id);
    if (existing) return existing;
    const preset = PRESET_SEARCH_PROVIDERS.find((p) => p.id === id);
    return {
      providerId: id,
      name: preset?.displayName ?? id,
      apiKeyRef: "",
      enabled: false
    };
  };

  const updateSearchProvider = (id: SearchProviderId, patch: Partial<SearchProviderConnection>) => {
    const existing = searchProviders.find((p) => p.providerId === id);
    if (existing) {
      setSettings({
        ...settings,
        searchProviders: searchProviders.map((p) =>
          p.providerId === id ? { ...p, ...patch } : p
        )
      });
    } else {
      const preset = PRESET_SEARCH_PROVIDERS.find((p) => p.id === id);
      if (!preset) return;
      const conn: SearchProviderConnection = {
        providerId: id,
        name: preset.displayName,
        apiKeyRef: "",
        enabled: false,
        ...patch
      };
      setSettings({ ...settings, searchProviders: [...searchProviders, conn] });
    }
  };

  const handleToggle = (id: SearchProviderId) => {
    const provider = ensureSearchProvider(id);
    updateSearchProvider(id, { enabled: !provider.enabled });
  };

  const handleSaveKey = (id: SearchProviderId) => {
    updateSearchProvider(id, { apiKeyRef: keyInput });
    setEditingKey(null);
    setKeyInput("");
    setVerifyResult((prev) => { const next = { ...prev }; delete next[id]; return next; });
  };

  const handleVerifyKey = async (provider: SearchProviderConnection) => {
    if (!provider.apiKeyRef) return;
    setVerifying(provider.providerId);
    setVerifyResult((prev) => { const next = { ...prev }; delete next[provider.providerId]; return next; });
    try {
      const res = await fetch("/api/verify-search-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: provider.providerId,
          apiKey: provider.apiKeyRef,
          ...(provider.baseUrl ? { baseUrl: provider.baseUrl } : {})
        })
      });
      const data = await res.json() as VerifyResult & { providerId?: string };
      const result: VerifyResult = {
        ok: data.ok,
        ...(data.message ? { message: data.message } : {}),
        ...(data.error ? { error: data.error } : {})
      };
      setVerifyResult((prev) => ({
        ...prev,
        [provider.providerId]: result
      }));
    } catch (err) {
      setVerifyResult((prev) => ({
        ...prev,
        [provider.providerId]: { ok: false, error: `请求失败: ${String(err)}` }
      }));
    } finally {
      setVerifying(null);
    }
  };

  return (
    <div className="providers-config-panel" data-testid="search-providers-config-panel">
      <p className="panel-desc">
        配置专利文献搜索 API。AI 检索候选文献时会调用这些服务。搜索服务列表由系统预置，不可自行添加。
      </p>

      <div className="provider-cards">
        {PRESET_SEARCH_PROVIDERS.map((preset) => {
          const provider = ensureSearchProvider(preset.id);
          const vResult = verifyResult[preset.id];
          return (
            <div
              key={preset.id}
              className={`provider-card ${provider.enabled ? "" : "provider-card--disabled"}`}
              data-testid={`search-provider-${preset.id}`}
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
                      data-testid={`toggle-search-${preset.id}`}
                    />
                    启用
                  </label>
                </div>
              </div>

              <div className="provider-card__body">
                <div className="provider-card__field">
                  <label>Endpoint</label>
                  <input
                    type="text"
                    value={preset.baseUrl}
                    readOnly
                    disabled
                    className="input-readonly"
                    data-testid={`baseurl-search-${preset.id}`}
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
                        data-testid={`input-search-key-${preset.id}`}
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
                        data-testid={`btn-edit-search-key-${preset.id}`}
                      >
                        {provider.apiKeyRef ? "修改" : "填写"}
                      </button>
                      {provider.apiKeyRef && (
                        <button
                          type="button"
                          className="btn-text"
                          disabled={verifying === preset.id}
                          onClick={() => handleVerifyKey(provider)}
                          data-testid={`btn-verify-search-key-${preset.id}`}
                        >
                          {verifying === preset.id ? "验证中..." : "验证"}
                        </button>
                      )}
                    </div>
                  )}
                  {vResult && (
                    <div className={`verify-result ${vResult.ok ? "verify-ok" : "verify-fail"}`}>
                      {vResult.ok ? vResult.message : vResult.error}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}