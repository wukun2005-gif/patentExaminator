/**
 * 知识库配置面板 — 调用 server API 处理提取/切片/向量化
 * nf-9: 知识库独立 API Provider 配置
 */
import { useState, useEffect, useCallback, useRef } from "react";
import type { KnowledgeConfig } from "@shared/types/knowledge";
import { DEFAULT_KNOWLEDGE_CONFIG } from "@shared/types/knowledge";
import type { KnowledgeProviderConnection } from "@shared/types/agents";
import { PRESET_KNOWLEDGE_PROVIDERS } from "@shared/types/agents";
import { useSettingsStore } from "../../store";
import { lastKnowledgeCitations } from "../../lib/agentApi";
import { createLogger } from "../../lib/logger";

const log = createLogger("KnowledgeConfigPanel");

const ACCEPTED_FORMATS = ".pdf,.txt,.md,.docx,.doc,.json,.xlsx,.xls,.csv,.jpg,.jpeg,.png";
const API = "/api/knowledge";

interface SourceInfo {
  id: string;
  name: string;
  type: string;
  format: string;
  mediaType: string;
  size: number;
  fileHash: string | null;
  sourceUrl: string | null;
  chunkCount: number;
  embedStatus: string;
  createdAt: string;
}

export function KnowledgeConfigPanel() {
  const { settings, updateKnowledgeConfig, setSettings } = useSettingsStore();
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [config, setConfig] = useState<KnowledgeConfig>(settings.knowledge ?? DEFAULT_KNOWLEDGE_CONFIG);
  const [configLoaded, setConfigLoaded] = useState(false);

  // settings 加载完成后同步 config
  useEffect(() => {
    if (settings.knowledge && !configLoaded) {
      setConfig(settings.knowledge);
      setConfigLoaded(true);
    }
  }, [settings.knowledge, configLoaded]);
  const [stats, setStats] = useState({ sourceCount: 0, chunkCount: 0, embeddedCount: 0 });
  const [importing, setImporting] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [testQuery, setTestQuery] = useState("");
  const [testResults, setTestResults] = useState<string>("");
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{ step: string; stepNum: number; totalSteps: number; detail?: string; percent: number } | null>(null);
  const [searching, setSearching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // nf-9: 知识库独立 Provider 配置
  const knowledgeProviders = settings.knowledgeProviders ?? [];

  /** 更新 settings（用于 knowledgeProviders） */
  const updateSettings = (partial: Partial<typeof settings>) => {
    const newSettings = { ...settings, ...partial };
    console.log("[KnowledgeConfig] updateSettings:", { knowledgeProviders: newSettings.knowledgeProviders?.map(k => ({ id: k.providerId, hasKey: !!k.apiKeyRef, enabled: k.enabled })) });
    setSettings(newSettings);
  };

  const refresh = useCallback(async () => {
    try {
      const [sourcesRes, statsRes] = await Promise.all([
        fetch(`${API}/sources`).then((r) => r.json()),
        fetch(`${API}/stats`).then((r) => r.json()),
      ]);
      if (sourcesRes.ok) setSources(sourcesRes.sources);
      if (statsRes.ok) setStats({ sourceCount: statsRes.sourceCount, chunkCount: statsRes.chunkCount, embeddedCount: statsRes.embeddedCount });
    } catch (err) {
      log(`Refresh error: ${err}`);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // 配置变更时持久化（仅在用户主动修改后）
  useEffect(() => {
    if (configLoaded) {
      updateKnowledgeConfig(config);
    }
  }, [config, configLoaded, updateKnowledgeConfig]);

  // ── 文件上传（server 端处理） ─────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setImporting(true);
    setImportResult(null);
    try {
      // 并行上传所有文件
      const fileArray = Array.from(files);
      const results = await Promise.all(fileArray.map((file) => uploadFileWithProgress(file)));
      await refresh();
      setImportResult(results.join("\n"));
    } catch (err) {
      setImportResult(`导入失败: ${err}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /** 上传文件并实时显示进度（SSE），失败自动重试一次 */
  const uploadFileWithProgress = async (file: File): Promise<string> => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await doUploadWithSSE(file);
        if (!result.startsWith("❌") || attempt === 2) return result;
        // 首次失败，等待 2 秒后重试
        setImportResult(`⏳ ${file.name} — 上传失败，${attempt < 2 ? "正在重试..." : ""}`);
        await new Promise((r) => setTimeout(r, 2000));
      } catch (err) {
        if (attempt === 2) return `❌ ${file.name} — ${err}`;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    return `❌ ${file.name} — 未知错误`;
  };

  const doUploadWithSSE = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);

    // bg-41: 传递 embedding 配置
    const embeddingProvider = knowledgeProviders.find(
      (p) => p.providerType === "embedding" && p.enabled && p.apiKeyRef
    );
    if (embeddingProvider) {
      formData.append("embeddingConfig", JSON.stringify({
        baseUrl: embeddingProvider.baseUrl,
        apiKey: embeddingProvider.apiKeyRef,
        modelId: embeddingProvider.modelId,
      }));
    }

    const res = await fetch(`${API}/upload`, { method: "POST", body: formData });

    if (!res.ok) {
      return `❌ ${file.name} — HTTP ${res.status}`;
    }

    // 读取 SSE 流
    const reader = res.body?.getReader();
    if (!reader) {
      return `❌ ${file.name} — 无法读取响应流`;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6)) as Record<string, unknown>;
          const step = data.step as string;

          if (step === "done") {
            setImportProgress(null);
            if (data.skipped) {
              return `⏭ ${file.name} — ${data.message}`;
            }
            return (data.message as string) ?? `✅ ${file.name}`;
          } else if (step === "error") {
            setImportProgress(null);
            return `❌ ${file.name} — ${data.error}`;
          } else if (step === "embedding" && data.progress) {
            const stepNum = (data.stepNum as number) ?? 5;
            const totalSteps = (data.totalSteps as number) ?? 5;
            const embedPercent = Math.round(((data.progress as number) / (data.total as number)) * 100);
            // embedding 是最后一步，占总进度的剩余部分
            const overallPercent = Math.round(((stepNum - 1) / totalSteps * 100) + (embedPercent / totalSteps));
            setImportProgress({ step: "向量化", stepNum, totalSteps, detail: `${data.progress}/${data.total}`, percent: overallPercent });
          } else if (data.step && data.stepNum) {
            const stepNum = data.stepNum as number;
            const totalSteps = data.totalSteps as number;
            const stepLabels: Record<string, string> = {
              extracting: "提取文本",
              preprocessing: "清洗规范化",
              chunking: "切片处理",
              storing: "存储入库",
              embedding: "向量化",
              "loading-model": "加载模型",
            };
            const label = stepLabels[step] ?? step;
            const percent = Math.round(((stepNum - 1) / totalSteps) * 100);
            setImportProgress({ step: label, stepNum, totalSteps, detail: data.message as string, percent });
          } else if (data.message) {
            setImportResult(`⏳ ${file.name} — ${data.message}`);
          }
        } catch {
          // 忽略解析错误
        }
      }
    }

    return `✅ ${file.name}`;
  };

  // ── URL 导入（server 端处理） ─────────────────────

  const handleUrlImport = async () => {
    if (!urlInput.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch(`${API}/import-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput }),
      });
      const data = await res.json() as { ok: boolean; message?: string; error?: string };
      setImportResult(data.ok ? (data.message ?? `✅ ${urlInput}`) : `❌ ${data.error}`);
      if (data.ok) setUrlInput("");
      await refresh();
    } catch (err) {
      setImportResult(`导入失败: ${err}`);
    } finally {
      setImporting(false);
    }
  };

  // ── 检索测试 ──────────────────────────────────────

  const handleTestSearch = async () => {
    if (!testQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`${API}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: testQuery, topK: config.topK }),
      });
      const data = await res.json() as { ok: boolean; results?: Array<{ text: string; score: number; metadata: Record<string, unknown> }>; error?: string };
      if (data.ok && data.results && data.results.length > 0) {
        const lines = data.results.map((r) => {
          const source = (r.metadata?.sectionId as string) ?? (r.metadata?.articleId as string) ?? (r.metadata?.fileName as string) ?? "未知";
          return `【${source} · ${r.score.toFixed(2)}】\n${r.text.slice(0, 200)}...`;
        });
        setTestResults(lines.join("\n\n---\n\n"));
      } else {
        setTestResults(data.ok ? "未找到相关内容" : `检索失败: ${data.error}`);
      }
    } catch (err) {
      setTestResults(`检索失败: ${err}`);
    } finally {
      setSearching(false);
    }
  };

  // ── 删除 ──────────────────────────────────────────

  const handleDelete = async (id: string) => {
    await fetch(`${API}/sources/${id}`, { method: "DELETE" });
    await refresh();
  };

  const handleClearAll = async () => {
    if (!window.confirm("确定要清空全部知识库数据吗？此操作不可恢复。")) return;
    await fetch(`${API}/clear`, { method: "DELETE" });
    await refresh();
  };

  return (
    <div className="knowledge-config-panel" data-testid="knowledge-config-panel">
      {/* 启用开关 */}
      <div className="knowledge-config-section">
        <label className="knowledge-toggle">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
          />
          启用知识库
        </label>
        <p className="knowledge-hint">
          启用后，AI 分析时自动检索相关法规知识，减少专业问题幻觉。
        </p>
      </div>

      {/* 统计 */}
      <div className="knowledge-stats">
        <span>来源: {stats.sourceCount}</span>
        <span>知识条目: {stats.chunkCount}</span>
      </div>

      {/* bg-75: 知识库未启用时，以下设置项置灰色 */}
      <div className={`knowledge-config-sections-wrapper${config.enabled ? "" : " knowledge-disabled"}`}>
      {/* cr-1: Embedding Provider 配置 — 纯远程 API，可选 */}
      <div className="knowledge-config-section">
        <h4>Embedding Provider（可选）</h4>
        <p className="knowledge-hint" style={{ marginBottom: "8px" }}>
          配置远程 Embedding API 后启用语义检索（hybrid search），未配置时仅使用 BM25 关键词检索。
        </p>
        {PRESET_KNOWLEDGE_PROVIDERS.filter((p) => p.providerType === "embedding").map((preset) => {
          const existing = knowledgeProviders.find(
            (p) => p.providerType === "embedding" && p.providerId === preset.providerId
          );
          return (
            <KnowledgeProviderCard
              key={preset.providerId}
              preset={preset}
              existing={existing}
              onUpdate={(updated) => {
                const others = knowledgeProviders.filter(
                  (p) => !(p.providerType === "embedding" && p.providerId === preset.providerId)
                );
                updateSettings({ knowledgeProviders: [...others, updated] });
              }}
            />
          );
        })}
      </div>

      {/* nf-9: Re-ranker Provider 配置 */}
      <div className="knowledge-config-section">
        <h4>Re-ranker Provider（可选）</h4>
        <p className="knowledge-hint" style={{ marginBottom: "8px" }}>
          Re-ranker 对检索结果进行二次排序，提升相关性。未配置时使用向量相似度排序。
        </p>
        {PRESET_KNOWLEDGE_PROVIDERS.filter((p) => p.providerType === "reranker").map((preset) => {
          const existing = knowledgeProviders.find(
            (p) => p.providerType === "reranker" && p.providerId === preset.providerId
          );
          return (
            <KnowledgeProviderCard
              key={preset.providerId}
              preset={preset}
              existing={existing}
              onUpdate={(updated) => {
                const others = knowledgeProviders.filter(
                  (p) => !(p.providerType === "reranker" && p.providerId === preset.providerId)
                );
                updateSettings({ knowledgeProviders: [...others, updated] });
              }}
            />
          );
        })}
      </div>

      {/* 文件上传 */}
      <div className="knowledge-config-section">
        <h4>上传文件</h4>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FORMATS}
          multiple
          onChange={handleFileUpload}
          disabled={importing || !config.enabled}
          data-testid="knowledge-file-input"
        />
        {importing && !importProgress && <span className="knowledge-status">处理中...</span>}
        {importing && importProgress && (
          <div className="knowledge-progress">
            <div className="knowledge-progress-bar">
              <div className="knowledge-progress-fill" style={{ width: `${importProgress.percent}%` }} />
            </div>
            <span className="knowledge-progress-text">
              {importProgress.step}（{importProgress.stepNum}/{importProgress.totalSteps}）
              {importProgress.detail ? ` — ${importProgress.detail}` : ""}
              {" "}{importProgress.percent}%
            </span>
          </div>
        )}
      </div>

      {/* URL 导入 */}
      <div className="knowledge-config-section">
        <h4>导入在线网页</h4>
        <div className="knowledge-url-row">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="输入网页 URL"
            disabled={!config.enabled}
            data-testid="knowledge-url-input"
          />
          <button type="button" onClick={handleUrlImport} disabled={importing || !urlInput.trim() || !config.enabled}>
            导入
          </button>
        </div>
      </div>

      {/* 导入结果 */}
      {importResult && (
        <div className="knowledge-config-section">
          <pre className="knowledge-test-results" data-testid="import-result">{importResult}</pre>
        </div>
      )}

      {/* 文件列表 */}
      {sources.length > 0 && (
        <div className="knowledge-config-section">
          <h4>已导入文件</h4>
          <div className="knowledge-source-list">
            {sources.map((s) => (
              <div key={s.id} className="knowledge-source-item">
                <span className="knowledge-source-name">{s.name}</span>
                <span className="knowledge-source-meta">
                  {s.mediaType} · {s.chunkCount} 条
                </span>
                <button type="button" onClick={() => handleDelete(s.id)} className="btn-delete" disabled={!config.enabled}>
                  删除
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={handleClearAll} className="btn-clear-all" disabled={!config.enabled}>
            清空全部
          </button>
        </div>
      )}

      {/* 知识库状态 */}
      <div className="knowledge-config-section">
        <h4>知识库状态</h4>
        {stats.chunkCount === stats.embeddedCount && stats.chunkCount > 0 ? (
          <p className="knowledge-hint">✅ 就绪（{stats.chunkCount} 条知识）</p>
        ) : stats.chunkCount > 0 ? (
          <p className="knowledge-hint">⏳ 处理中（{stats.embeddedCount}/{stats.chunkCount}）</p>
        ) : (
          <p className="knowledge-hint">上传文件后自动处理</p>
        )}
      </div>
      </div>

      {/* 检索测试 */}
      <div className="knowledge-config-section">
        <h4>检索测试</h4>
        <div className="knowledge-url-row">
          <input
            type="text"
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            placeholder="输入测试 query"
            data-testid="knowledge-test-input"
          />
          <button
            type="button"
            onClick={handleTestSearch}
            disabled={!testQuery.trim() || searching || stats.embeddedCount === 0}
          >
            {searching ? "检索中..." : "测试"}
          </button>
        </div>
        {testResults && (
          <pre className="knowledge-test-results" data-testid="knowledge-test-results">
            {testResults}
          </pre>
        )}
      </div>

      {/* 最近知识库引用（Agent 调用时自动更新） */}
      {lastKnowledgeCitations.length > 0 && (
        <div className="knowledge-config-section">
          <h4>最近引用的知识库内容</h4>
          <p className="knowledge-hint">以下是最近一次 Agent 调用时从知识库检索到的内容：</p>
          <div className="knowledge-test-results">
            {lastKnowledgeCitations.map((c, i) => (
              <div key={i} style={{ marginBottom: "0.5rem", borderBottom: "1px solid var(--border-color, #eee)", paddingBottom: "0.5rem" }}>
                <strong>【{c.source} · {c.score.toFixed(2)}】</strong>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>{c.excerpt}...</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── nf-9: 知识库 Provider 卡片组件 ─────────────────────

interface KnowledgeProviderCardProps {
  preset: typeof PRESET_KNOWLEDGE_PROVIDERS[number];
  existing?: KnowledgeProviderConnection;
  onUpdate: (provider: KnowledgeProviderConnection) => void;
}

function KnowledgeProviderCard({ preset, existing, onUpdate }: KnowledgeProviderCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [apiKey, setApiKey] = useState(existing?.apiKeyRef ?? "");
  const [modelId, setModelId] = useState(existing?.modelId ?? preset.defaultModelId);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const isEnabled = existing?.enabled ?? false;
  const hasKey = !!existing?.apiKeyRef;

  const handleToggle = () => {
    onUpdate({
      providerType: preset.providerType,
      providerId: preset.providerId,
      displayName: preset.displayName,
      baseUrl: preset.baseUrl,
      apiKeyRef: apiKey,
      modelId,
      availableModels: existing?.availableModels ?? [],
      enabled: !isEnabled,
    });
  };

  const handleSaveKey = () => {
    console.log("[KnowledgeConfig] Saving key:", { providerId: preset.providerId, apiKeyRef: apiKey ? "***" : "(empty)", apiKeyLength: apiKey.length });
    onUpdate({
      providerType: preset.providerType,
      providerId: preset.providerId,
      displayName: preset.displayName,
      baseUrl: preset.baseUrl,
      apiKeyRef: apiKey,
      modelId,
      availableModels: existing?.availableModels ?? [],
      enabled: isEnabled,
    });
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/knowledge/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerType: preset.providerType,
          baseUrl: preset.baseUrl,
          apiKey,
          modelId,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      setTestResult(data.ok ? "连接成功" : `连接失败: ${data.error}`);
    } catch (err) {
      setTestResult(`测试失败: ${err}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="provider-card" style={{
      border: "1px solid var(--border-color, #ddd)",
      borderRadius: "8px",
      padding: "12px",
      marginBottom: "8px",
      background: isEnabled ? "var(--bg-primary, #fff)" : "var(--bg-secondary, #f5f5f5)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => { e.stopPropagation(); handleToggle(); }}
          />
          <strong>{preset.displayName}</strong>
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary, #666)" }}>{preset.desc}</span>
        </div>
        <span>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: "12px", paddingLeft: "24px" }}>
          <div style={{ marginBottom: "8px" }}>
            <label style={{ display: "block", marginBottom: "4px" }}>Base URL:</label>
            <input
              type="text"
              value={preset.baseUrl}
              readOnly
              style={{ width: "100%", padding: "6px", background: "var(--bg-secondary, #f5f5f5)" }}
            />
          </div>
          <div style={{ marginBottom: "8px" }}>
            <label style={{ display: "block", marginBottom: "4px" }}>API Key:</label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={preset.keyPlaceholder}
                style={{ flex: 1, padding: "6px" }}
              />
              <button onClick={handleSaveKey} style={{ padding: "6px 12px" }}>
                {hasKey ? "更新" : "保存"}
              </button>
            </div>
          </div>
          <div style={{ marginBottom: "8px" }}>
            <label style={{ display: "block", marginBottom: "4px" }}>模型 ID:</label>
            <input
              type="text"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder={preset.defaultModelId}
              style={{ width: "100%", padding: "6px" }}
            />
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={handleTestConnection} disabled={testing || !apiKey}>
              {testing ? "测试中..." : "测试连接"}
            </button>
            {testResult && (
              <span style={{ color: testResult.includes("成功") ? "var(--success, #28a745)" : "var(--danger, #dc3545)" }}>
                {testResult}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
