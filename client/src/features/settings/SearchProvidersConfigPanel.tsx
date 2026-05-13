import { useState } from "react";
import type { SearchProviderConnection, SearchProviderId } from "@shared/types/agents";
import { useSettingsStore } from "../../store";

const SEARCH_PROVIDER_OPTIONS: Array<{ id: SearchProviderId; name: string; desc: string; keyPlaceholder: string }> = [
  { id: "tavily", name: "Tavily", desc: "免费额度 1000 次/月，注册地址: app.tavily.com", keyPlaceholder: "tvly-..." },
  { id: "serpapi", name: "SerpAPI", desc: "Google 专利搜索 API，免费额度 100 次/月", keyPlaceholder: "your-serpapi-key" },
  { id: "custom", name: "自定义", desc: "自定义搜索 API 端点", keyPlaceholder: "your-api-key" }
];

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

  const updateSearchProvider = (id: SearchProviderId, patch: Partial<SearchProviderConnection>) => {
    setSettings({
      ...settings,
      searchProviders: searchProviders.map((p) =>
        p.providerId === id ? { ...p, ...patch } : p
      )
    });
  };

  const handleAdd = (id: SearchProviderId) => {
    if (searchProviders.some((p) => p.providerId === id)) return;
    const opt = SEARCH_PROVIDER_OPTIONS.find((o) => o.id === id);
    const conn: SearchProviderConnection = {
      providerId: id,
      name: opt?.name ?? id,
      apiKeyRef: "",
      enabled: true
    };
    setSettings({ ...settings, searchProviders: [...searchProviders, conn] });
  };

  const handleRemove = (id: SearchProviderId) => {
    setSettings({ ...settings, searchProviders: searchProviders.filter((p) => p.providerId !== id) });
  };

  const handleToggle = (id: SearchProviderId) => {
    updateSearchProvider(id, { enabled: !searchProviders.find((p) => p.providerId === id)?.enabled });
  };

  const handleSaveKey = (id: SearchProviderId) => {
    updateSearchProvider(id, { apiKeyRef: keyInput });
    setEditingKey(null);
    setKeyInput("");
    // Clear previous verify result when key changes
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

  const available = SEARCH_PROVIDER_OPTIONS.filter(
    (opt) => !searchProviders.some((p) => p.providerId === opt.id)
  );

  return (
    <div className="providers-config-panel" data-testid="search-providers-config-panel">
      <p className="panel-desc">
        配置专利文献搜索 API。AI 检索候选文献时会调用这些服务。至少需要配置一个搜索 API 才能使用 AI 检索功能。
      </p>

      <div className="provider-cards">
        {searchProviders.map((provider) => {
          const info = SEARCH_PROVIDER_OPTIONS.find((o) => o.id === provider.providerId);
          const vResult = verifyResult[provider.providerId];
          return (
            <div
              key={provider.providerId}
              className={`provider-card ${provider.enabled ? "" : "provider-card--disabled"}`}
              data-testid={`search-provider-${provider.providerId}`}
            >
              <div className="provider-card__header">
                <div>
                  <strong>{provider.name}</strong>
                  <span className="provider-card__desc">{info?.desc}</span>
                </div>
                <div className="provider-card__actions">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={provider.enabled}
                      onChange={() => handleToggle(provider.providerId)}
                      data-testid={`toggle-search-${provider.providerId}`}
                    />
                    启用
                  </label>
                  <button
                    type="button"
                    className="btn-text btn-danger"
                    onClick={() => handleRemove(provider.providerId)}
                    data-testid={`btn-remove-search-${provider.providerId}`}
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
                        placeholder={info?.keyPlaceholder ?? "api-key"}
                        data-testid={`input-search-key-${provider.providerId}`}
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
                        data-testid={`btn-edit-search-key-${provider.providerId}`}
                      >
                        {provider.apiKeyRef ? "修改" : "填写"}
                      </button>
                      {provider.apiKeyRef && (
                        <button
                          type="button"
                          className="btn-text"
                          disabled={verifying === provider.providerId}
                          onClick={() => handleVerifyKey(provider)}
                          data-testid={`btn-verify-search-key-${provider.providerId}`}
                        >
                          {verifying === provider.providerId ? "验证中..." : "验证"}
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

                {provider.providerId === "custom" && (
                  <div className="provider-card__field">
                    <label>API 端点</label>
                    <input
                      type="text"
                      value={provider.baseUrl ?? ""}
                      onChange={(e) => updateSearchProvider(provider.providerId, { baseUrl: e.target.value })}
                      placeholder="https://api.example.com/search"
                      data-testid={`input-search-baseurl-${provider.providerId}`}
                    />
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
            onChange={(e) => { if (e.target.value) handleAdd(e.target.value as SearchProviderId); }}
            data-testid="select-add-search-provider"
          >
            <option value="">+ 添加搜索服务</option>
            {available.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.name} — {opt.desc}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
