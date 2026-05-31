import { useState, useEffect, useCallback, useRef } from "react";
import type { KnowledgeSource, KnowledgeConfig } from "@shared/types/knowledge";
import { DEFAULT_KNOWLEDGE_CONFIG } from "@shared/types/knowledge";
import type { ProviderId } from "@shared/types/agents";
import { PRESET_MODEL_PROVIDERS } from "@shared/types/agents";
import { useSettingsStore } from "../../store";
import {
  getAllSources,
  addSource,
  deleteSource,
  addChunks,
  addVectors,
  markChunkEmbedded,
  getUnembeddedChunks,
  getKnowledgeStats,
  clearAllKnowledge,
} from "../../lib/knowledge/knowledgeRepo";
import {
  extractFromFile,
  extractFromUrl,
  inferFileFormat,
  inferMediaType,
} from "../../lib/knowledge/extractors";
import { chunkContent } from "../../lib/knowledge/chunkers";
import { embedChunks } from "../../lib/knowledge/embedder";
import type { EmbedderConfig } from "../../lib/knowledge/embedder";
import { buildVectorIndex, searchKnowledge, invalidateVectorIndex } from "../../lib/knowledge/vectorStore";
import { embedSingle } from "../../lib/knowledge/embedder";
import { formatRetrievedChunks } from "../../lib/knowledge/retriever";
import { computeFileHash } from "../../lib/fileHash";
import { createLogger } from "../../lib/logger";

const log = createLogger("KnowledgeConfigPanel");

const ACCEPTED_FORMATS = ".pdf,.txt,.md,.docx,.doc,.json,.xlsx,.xls,.csv,.jpg,.jpeg,.png";

export function KnowledgeConfigPanel() {
  const { settings, updateKnowledgeConfig } = useSettingsStore();
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [config, setConfig] = useState<KnowledgeConfig>(settings.knowledge ?? DEFAULT_KNOWLEDGE_CONFIG);
  const [stats, setStats] = useState({ sourceCount: 0, chunkCount: 0, embeddedCount: 0 });
  const [importing, setImporting] = useState(false);
  const [embedding, setEmbedding] = useState(false);
  const [embedProgress, setEmbedProgress] = useState({ done: 0, total: 0 });
  const [urlInput, setUrlInput] = useState("");
  const [testQuery, setTestQuery] = useState("");
  const [testResults, setTestResults] = useState<string>("");
  const [importResult, setImportResult] = useState<string | null>(null);
  const [previewSourceId, setPreviewSourceId] = useState<string | null>(null);
  const [previewChunks, setPreviewChunks] = useState<Array<{ index: number; text: string; metadata: Record<string, unknown> }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 所有已添加的 Provider 列表（用于远程 embedding 选择）
  const configuredProviders = settings.providers;

  const refresh = useCallback(async () => {
    setSources(await getAllSources());
    setStats(await getKnowledgeStats());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 配置变更时持久化到 settings
  useEffect(() => {
    updateKnowledgeConfig(config);
  }, [config, updateKnowledgeConfig]);

  // ── 文件上传 ──────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setImporting(true);
    setImportResult(null);
    const results: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const result = await importFile(file);
        results.push(result);
      }
      await refresh();
      setImportResult(results.join("\n"));
    } catch (err) {
      setImportResult(`导入失败: ${err}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const importFile = async (file: File): Promise<string> => {
    // 文件级去重：检查 hash
    const fileHash = await computeFileHash(file);
    const existingSources = await getAllSources();
    const duplicate = existingSources.find((s) => (s as unknown as Record<string, unknown>).fileHash === fileHash);
    if (duplicate) {
      return `⏭ ${file.name} — 已存在（同 ${duplicate.name}）`;
    }

    const format = inferFileFormat(file.name);
    const mediaType = inferMediaType(format);
    const sourceId = `ks-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const source: KnowledgeSource = {
      id: sourceId,
      type: "file",
      name: file.name,
      format,
      mediaType,
      size: file.size,
      fileHash,
      chunkCount: 0,
      embedStatus: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 提取内容
    const extraction = await extractFromFile(file);
    const rawChunks = chunkContent(extraction, file.name);

    // Chunk 级去重：检查文本 hash
    const { hashChunkText } = await import("../../lib/knowledge/normalizers");
    const existingChunks = await import("../../lib/knowledge/knowledgeRepo").then((m) =>
      m.getAllSources().then((sources) =>
        Promise.all(sources.map((s) => m.getChunksBySource(s.id)))
      ).then((arrays) => arrays.flat())
    );
    const existingHashes = new Set<string>();
    for (const chunk of existingChunks) {
      const h = await hashChunkText(chunk.text);
      existingHashes.add(h);
    }

    // 创建 chunk 记录（跳过重复）
    const now = new Date().toISOString();
    const chunks: Array<{
      id: string; sourceId: string; index: number; text: string;
      strategy: "auto"; metadata: Record<string, unknown>; embedded: boolean; createdAt: string;
    }> = [];
    let dedupCount = 0;
    for (let i = 0; i < rawChunks.length; i++) {
      const rc = rawChunks[i];
      const h = await hashChunkText(rc.text);
      if (existingHashes.has(h)) {
        dedupCount++;
        continue;
      }
      chunks.push({
        id: `${sourceId}-c${i}`,
        sourceId,
        index: i,
        text: rc.text,
        strategy: "auto" as const,
        metadata: {
          fileName: file.name,
          mediaType,
          ...rc.metadata,
        },
        embedded: false,
        createdAt: now,
      });
    }

    if (dedupCount > 0) {
      log(`Dedup: skipped ${dedupCount} duplicate chunks from ${file.name}`);
    }

    source.chunkCount = chunks.length;
    source.embedStatus = "processing";
    await addSource(source);
    await addChunks(chunks);
    log(`Imported ${file.name}: ${chunks.length} chunks`);

    // 自动向量化
    if (chunks.length > 0) {
      await autoVectorize();
    }

    const dedupMsg = dedupCount > 0 ? `，${dedupCount} 条重复跳过` : "";
    return `✅ ${file.name} — ${chunks.length} 条知识已入库${dedupMsg}`;
  };

  // ── URL 导入 ──────────────────────────────────────

  const handleUrlImport = async () => {
    if (!urlInput.trim()) return;
    setImporting(true);
    try {
      const sourceId = `ks-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const extraction = await extractFromUrl(urlInput);
      const rawChunks = chunkContent(extraction, urlInput);

      const now = new Date().toISOString();
      const chunks = rawChunks.map((rc, i) => ({
        id: `${sourceId}-c${i}`,
        sourceId,
        index: i,
        text: rc.text,
        strategy: "auto" as const,
        metadata: {
          fileName: urlInput,
          mediaType: "text" as const,
          ...rc.metadata,
        },
        embedded: false,
        createdAt: now,
      }));

      const source: KnowledgeSource = {
        id: sourceId,
        type: "url",
        name: urlInput,
        format: "html",
        mediaType: "text",
        size: 0,
        sourceUrl: urlInput,
        chunkCount: chunks.length,
        embedStatus: "pending",
        createdAt: now,
        updatedAt: now,
      };

      await addSource(source);
      await addChunks(chunks);
      setUrlInput("");
      log(`Imported URL: ${urlInput} (${chunks.length} chunks)`);

      // 自动向量化
      if (chunks.length > 0) {
        await autoVectorize();
      }
      setImportResult(`✅ ${urlInput} — ${chunks.length} 条知识已入库`);
    } catch (err) {
      setImportResult(`❌ 导入失败: ${err}`);
    } finally {
      setImporting(false);
    }
  };

  // ── 向量化（自动） ──────────────────────────────────

  const [embedError, setEmbedError] = useState<string | null>(null);

  const autoVectorize = async () => {
    setEmbedding(true);
    setEmbedError(null);
    setEmbedProgress({ done: 0, total: 0 });
    try {
      const unembedded = await getUnembeddedChunks();
      if (unembedded.length === 0) return;

      // 检查 embedding 配置
      if (config.embedProvider === "remote" && !config.remoteProviderId) {
        setEmbedError("请先在设置中选择远程 embedding Provider");
        return;
      }

      const provider = configuredProviders.find((p) => p.providerId === config.remoteProviderId);
      const embedConfig: EmbedderConfig = {
        type: config.embedProvider,
        ...(provider?.baseUrl ? { remoteBaseUrl: provider.baseUrl } : {}),
        ...(provider?.apiKeyRef ? { remoteApiKey: provider.apiKeyRef } : {}),
        ...(config.remoteModelId ? { remoteModelId: config.remoteModelId } : {}),
      };

      const vectors = await embedChunks(
        unembedded,
        embedConfig,
        5,
        (done, total) => setEmbedProgress({ done, total })
      );

      await addVectors(vectors);
      for (const chunk of unembedded) {
        await markChunkEmbedded(chunk.id);
      }

      invalidateVectorIndex();
      await buildVectorIndex();
      await refresh();
      log(`Embedded ${vectors.length} chunks`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setEmbedError(`向量化失败: ${msg}`);
      log(`Embed error: ${msg}`);
    } finally {
      setEmbedding(false);
    }
  };

  // ── 检索测试 ──────────────────────────────────────

  const handleTestSearch = async () => {
    if (!testQuery.trim()) return;
    try {
      const queryVector = await embedSingle(testQuery, {
        type: config.embedProvider,
        ...(config.remoteModelId ? { remoteModelId: config.remoteModelId } : {}),
      });
      const results = await searchKnowledge(queryVector, config.topK, config.scoreThreshold);
      setTestResults(formatRetrievedChunks(results) || "未找到相关内容");
    } catch (err) {
      setTestResults(`检索失败: ${err}`);
    }
  };

  // ── Chunk 预览 ──────────────────────────────────────

  const handlePreview = async (sourceId: string) => {
    if (previewSourceId === sourceId) {
      setPreviewSourceId(null);
      setPreviewChunks([]);
      return;
    }
    const { getChunksBySource } = await import("../../lib/knowledge/knowledgeRepo");
    const chunks = await getChunksBySource(sourceId);
    setPreviewSourceId(sourceId);
    setPreviewChunks(chunks.slice(0, 5).map((c) => ({ index: c.index, text: c.text.slice(0, 200), metadata: c.metadata as Record<string, unknown> })));
  };

  // ── 删除 ──────────────────────────────────────────

  const handleDelete = async (id: string) => {
    await deleteSource(id);
    invalidateVectorIndex();
    await refresh();
  };

  const handleClearAll = async () => {
    if (!window.confirm("确定要清空全部知识库数据吗？此操作不可恢复，所有切片和向量数据将被删除。")) return;
    await clearAllKnowledge();
    invalidateVectorIndex();
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
          启用知识库 RAG
        </label>
        <p className="knowledge-hint">
          启用后，Agent 调用时会自动检索相关法规知识注入 prompt，减少幻觉。
        </p>
      </div>

      {/* Embedding 配置 */}
      <div className="knowledge-config-section">
        <h4>Embedding 模型</h4>
        <div className="knowledge-embed-options">
          <label>
            <input
              type="radio"
              name="embedProvider"
              checked={config.embedProvider === "local"}
              onChange={() => {
                if (stats.embeddedCount > 0 && config.embedProvider !== "local") {
                  if (!window.confirm(`切换 embedding 模型后，已有的 ${stats.embeddedCount} 个向量需要全部重新生成。确定切换吗？`)) return;
                }
                const { remoteProviderId: _rp, remoteModelId: _rm, ...rest } = config;
                void _rp; void _rm;
                setConfig({ ...rest, embedProvider: "local" });
              }}
            />
            本地模型（Transformers.js + BGE-large-zh，首次需下载 ~400MB）
          </label>
          <label>
            <input
              type="radio"
              name="embedProvider"
              checked={config.embedProvider === "remote"}
              onChange={() => {
                if (stats.embeddedCount > 0 && config.embedProvider !== "remote") {
                  if (!window.confirm(`切换 embedding 模型后，已有的 ${stats.embeddedCount} 个向量需要全部重新生成。确定切换吗？`)) return;
                }
                setConfig({ ...config, embedProvider: "remote" });
              }}
            />
            远程 API（复用已配置的 Provider）
          </label>
        </div>

        {config.embedProvider === "remote" && (
          <div className="knowledge-remote-config">
            <div className="knowledge-config-row">
              <label>Provider:</label>
              <select
                value={config.remoteProviderId ?? ""}
                onChange={(e) => {
                  const pid = e.target.value as ProviderId;
                  setConfig({ ...config, remoteProviderId: pid, remoteModelId: "" });
                }}
              >
                <option value="">选择 Provider</option>
                {PRESET_MODEL_PROVIDERS.map((preset) => {
                  const configured = configuredProviders.find((p) => p.providerId === preset.id);
                  const hasKey = !!configured?.apiKeyRef;
                  return (
                    <option key={preset.id} value={preset.id}>
                      {preset.displayName} — {preset.desc}{hasKey ? "" : " (未配置 API Key)"}
                    </option>
                  );
                })}
              </select>
            </div>
            {config.remoteProviderId && (() => {
              const configured = configuredProviders.find((p) => p.providerId === config.remoteProviderId);
              const preset = PRESET_MODEL_PROVIDERS.find((p) => p.id === config.remoteProviderId);
              if (!configured?.apiKeyRef) {
                return (
                  <p className="knowledge-hint" style={{ color: "var(--danger)" }}>
                    该 Provider 未配置 API Key，请先在"模型连接" tab 中添加并填写 Key。
                  </p>
                );
              }
              return (
                <>
                  <div className="knowledge-config-row">
                    <label>Embedding 模型 ID:</label>
                    <input
                      type="text"
                      value={config.remoteModelId ?? ""}
                      onChange={(e) => setConfig({ ...config, remoteModelId: e.target.value })}
                      placeholder={`如 ${preset?.id === "glm" ? "embedding-3" : preset?.id === "openrouter" ? "text-embedding-3-small" : "embedding-model-id"}`}
                    />
                  </div>
                  <p className="knowledge-hint">
                    API 地址: {configured.baseUrl ?? preset?.baseUrl ?? "默认"}
                  </p>
                </>
              );
            })()}
            <p className="knowledge-hint">
              支持 OpenAI-compatible Embedding API。常见 embedding 模型：GLM embedding-3、OpenRouter text-embedding-3-small。
            </p>
          </div>
        )}
      </div>

      {/* 统计 */}
      <div className="knowledge-stats">
        <span>来源: {stats.sourceCount}</span>
        <span>知识条目: {stats.chunkCount}</span>
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
          disabled={importing}
          data-testid="knowledge-file-input"
        />
        {importing && <span className="knowledge-status">导入中...</span>}
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
            data-testid="knowledge-url-input"
          />
          <button
            type="button"
            onClick={handleUrlImport}
            disabled={importing || !urlInput.trim()}
          >
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
                  {s.mediaType} · {s.chunkCount} 切片 · {s.embedStatus}
                </span>
                <button type="button" onClick={() => handleDelete(s.id)} className="btn-delete">
                  删除
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={handleClearAll} className="btn-clear-all">
            清空全部
          </button>
        </div>
      )}

      {/* 知识库状态 */}
      <div className="knowledge-config-section">
        <h4>知识库状态</h4>
        {embedding ? (
          <p className="knowledge-hint">处理中... {embedProgress.done}/{embedProgress.total}</p>
        ) : embedError ? (
          <p className="knowledge-hint" style={{ color: "var(--danger)" }}>❌ {embedError}</p>
        ) : stats.chunkCount === stats.embeddedCount && stats.chunkCount > 0 ? (
          <p className="knowledge-hint">✅ 就绪（{stats.chunkCount} 条知识）</p>
        ) : stats.chunkCount > 0 ? (
          <div>
            <p className="knowledge-hint">⏳ 处理中（{stats.embeddedCount}/{stats.chunkCount}）</p>
            <button
              type="button"
              onClick={() => autoVectorize()}
              disabled={embedding}
              style={{ marginTop: "0.5rem" }}
            >
              继续处理
            </button>
          </div>
        ) : (
          <p className="knowledge-hint">上传文件后自动处理</p>
        )}
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
            disabled={!testQuery.trim() || stats.embeddedCount === 0}
          >
            测试
          </button>
        </div>
        {testResults && (
          <pre className="knowledge-test-results" data-testid="knowledge-test-results">
            {testResults}
          </pre>
        )}
      </div>

      {/* 知识库统计 */}
      <div className="knowledge-config-section">
        <h4>知识库统计</h4>
        <div className="knowledge-stats-detail">
          <div className="knowledge-stat-item">
            <span className="stat-label">来源文件</span>
            <span className="stat-value">{stats.sourceCount}</span>
          </div>
          <div className="knowledge-stat-item">
            <span className="stat-label">切片总数</span>
            <span className="stat-value">{stats.chunkCount}</span>
          </div>
          <div className="knowledge-stat-item">
            <span className="stat-label">已就绪</span>
            <span className="stat-value">{stats.embeddedCount}</span>
          </div>
        </div>
      </div>

      {/* 知识库浏览器 */}
      {sources.length > 0 && (
        <div className="knowledge-config-section">
          <h4>知识库浏览器</h4>
          <div className="knowledge-browser">
            {sources.map((s) => (
              <div key={s.id} className="knowledge-source-detail">
                <div className="knowledge-source-header">
                  <span>{s.name} ({s.chunkCount} 切片, {s.mediaType})</span>
                  {s.documentCategory && <span className="doc-category-tag">{s.documentCategory}</span>}
                  <button
                    type="button"
                    className="btn-preview"
                    onClick={() => handlePreview(s.id)}
                    data-testid={`btn-preview-${s.id}`}
                  >
                    {previewSourceId === s.id ? "收起" : "预览"}
                  </button>
                </div>
                <div className="knowledge-source-info">
                  <p>格式: {s.format} | 大小: {s.size > 0 ? `${(s.size / 1024).toFixed(1)} KB` : "URL"}</p>
                  {s.sourceUrl && <p>来源: {s.sourceUrl}</p>}
                  {s.fileHash && <p>Hash: {s.fileHash.slice(0, 16)}...</p>}
                  <p>创建时间: {new Date(s.createdAt).toLocaleString()}</p>
                </div>
                {previewSourceId === s.id && previewChunks.length > 0 && (
                  <div className="knowledge-chunk-preview">
                    <p className="chunk-preview-header">前 {previewChunks.length} 个切片：</p>
                    {previewChunks.map((c) => (
                      <div key={c.index} className="chunk-preview-item">
                        <span className="chunk-index">#{c.index}</span>
                        <span className="chunk-text">{c.text}...</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
