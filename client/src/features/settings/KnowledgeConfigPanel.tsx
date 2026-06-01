/**
 * 知识库配置面板 — 调用 server API 处理提取/切片/向量化
 */
import { useState, useEffect, useCallback, useRef } from "react";
import type { KnowledgeConfig } from "@shared/types/knowledge";
import { DEFAULT_KNOWLEDGE_CONFIG } from "@shared/types/knowledge";
import type { ProviderId } from "@shared/types/agents";
import { PRESET_MODEL_PROVIDERS } from "@shared/types/agents";
import { useSettingsStore } from "../../store";
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
  const { settings, updateKnowledgeConfig } = useSettingsStore();
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [config, setConfig] = useState<KnowledgeConfig>(settings.knowledge ?? DEFAULT_KNOWLEDGE_CONFIG);
  const [stats, setStats] = useState({ sourceCount: 0, chunkCount: 0, embeddedCount: 0 });
  const [importing, setImporting] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [testQuery, setTestQuery] = useState("");
  const [testResults, setTestResults] = useState<string>("");
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{ step: string; stepNum: number; totalSteps: number; detail?: string; percent: number } | null>(null);
  const [searching, setSearching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const configuredProviders = settings.providers;

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

  useEffect(() => { updateKnowledgeConfig(config); }, [config, updateKnowledgeConfig]);

  // ── 文件上传（server 端处理） ─────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setImporting(true);
    setImportResult(null);
    const results: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const fileResult = await uploadFileWithProgress(file);
        results.push(fileResult);
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
    let lastProgress = "";

    while (true) {
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
            data-testid="knowledge-url-input"
          />
          <button type="button" onClick={handleUrlImport} disabled={importing || !urlInput.trim()}>
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
        {stats.chunkCount === stats.embeddedCount && stats.chunkCount > 0 ? (
          <p className="knowledge-hint">✅ 就绪（{stats.chunkCount} 条知识）</p>
        ) : stats.chunkCount > 0 ? (
          <p className="knowledge-hint">⏳ 处理中（{stats.embeddedCount}/{stats.chunkCount}）</p>
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
    </div>
  );
}
