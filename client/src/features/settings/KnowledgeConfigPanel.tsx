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
import { createLogger } from "../../lib/logger";

const log = createLogger("KnowledgeConfigPanel");

const ACCEPTED_FORMATS = ".pdf,.txt,.md,.docx,.doc,.json,.xlsx,.xls,.csv,.jpg,.jpeg,.png";

export function KnowledgeConfigPanel() {
  const { settings } = useSettingsStore();
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [config, setConfig] = useState<KnowledgeConfig>(DEFAULT_KNOWLEDGE_CONFIG);
  const [stats, setStats] = useState({ sourceCount: 0, chunkCount: 0, embeddedCount: 0 });
  const [importing, setImporting] = useState(false);
  const [embedding, setEmbedding] = useState(false);
  const [embedProgress, setEmbedProgress] = useState({ done: 0, total: 0 });
  const [urlInput, setUrlInput] = useState("");
  const [testQuery, setTestQuery] = useState("");
  const [testResults, setTestResults] = useState<string>("");
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

  // ── 文件上传 ──────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setImporting(true);
    try {
      for (const file of Array.from(files)) {
        await importFile(file);
      }
      await refresh();
    } catch (err) {
      log(`Import error: ${err}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const importFile = async (file: File) => {
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
      chunkCount: 0,
      embedStatus: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 提取内容
    const extraction = await extractFromFile(file);
    const rawChunks = chunkContent(extraction, file.name);

    // 创建 chunk 记录
    const now = new Date().toISOString();
    const chunks = rawChunks.map((rc, i) => ({
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
    }));

    source.chunkCount = chunks.length;
    await addSource(source);
    await addChunks(chunks);
    log(`Imported ${file.name}: ${chunks.length} chunks`);
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
      await refresh();
      log(`Imported URL: ${urlInput} (${chunks.length} chunks)`);
    } catch (err) {
      log(`URL import error: ${err}`);
    } finally {
      setImporting(false);
    }
  };

  // ── 向量化 ────────────────────────────────────────

  const handleEmbed = async () => {
    setEmbedding(true);
    setEmbedProgress({ done: 0, total: 0 });
    try {
      const unembedded = await getUnembeddedChunks();
      if (unembedded.length === 0) return;

      const provider = configuredProviders.find((p) => p.providerId === config.remoteProviderId);
      const embedConfig: EmbedderConfig = {
        type: config.embedProvider,
        remoteBaseUrl: provider?.baseUrl,
        remoteApiKey: provider?.apiKeyRef,
        remoteModelId: config.remoteModelId,
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
      log(`Embed error: ${err}`);
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
        remoteModelId: config.remoteModelId,
      });
      const results = await searchKnowledge(queryVector, config.topK, config.scoreThreshold);
      setTestResults(formatRetrievedChunks(results) || "未找到相关内容");
    } catch (err) {
      setTestResults(`检索失败: ${err}`);
    }
  };

  // ── 删除 ──────────────────────────────────────────

  const handleDelete = async (id: string) => {
    await deleteSource(id);
    invalidateVectorIndex();
    await refresh();
  };

  const handleClearAll = async () => {
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
              onChange={() => setConfig({ ...config, embedProvider: "local", remoteProviderId: undefined, remoteModelId: undefined })}
            />
            本地模型（Transformers.js + BGE-large-zh，首次需下载 ~400MB）
          </label>
          <label>
            <input
              type="radio"
              name="embedProvider"
              checked={config.embedProvider === "remote"}
              onChange={() => setConfig({ ...config, embedProvider: "remote" })}
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
        <span>切片: {stats.chunkCount}</span>
        <span>已向量化: {stats.embeddedCount}</span>
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

      {/* 向量化 */}
      <div className="knowledge-config-section">
        <h4>向量化</h4>
        <button
          type="button"
          onClick={handleEmbed}
          disabled={embedding || stats.chunkCount === stats.embeddedCount}
        >
          {embedding
            ? `向量化中 (${embedProgress.done}/${embedProgress.total})`
            : stats.chunkCount === stats.embeddedCount
              ? "全部已向量化"
              : "开始向量化"}
        </button>
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
    </div>
  );
}
