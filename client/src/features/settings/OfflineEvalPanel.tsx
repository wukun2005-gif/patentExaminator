/**
 * Offline Eval Panel — Settings 页独立 tab（从 MetricsDashboard 拆分）
 *
 * 纯 UI 组件：所有数据直接从 server API 获取，
 * 本地只有 useState（UI 状态），无 store，无逻辑处理。
 */
import { Fragment, useEffect, useState, useCallback, useRef } from "react";
import { createLogger } from "../../lib/logger";
import { connectNotifications, disconnectNotifications, onNotification, type TaskNotification } from "../../lib/notifications";
import { useSettingsStore } from "../../store";

const _log = createLogger("OfflineEvalPanel");

// ── Server response shapes ───────────────────────────────

interface SummaryRow {
  provider_id: string;
  model_id: string;
  search_provider: string;
  reranker_type: string;
  embedding_model: string;
}

interface GoldenQuestion {
  id: string;
  agent: string;
  query: string;
  expectedAnswer: string;
  expectedSources: string[];
  expectedArticles: string[];
  category: string;
  difficulty: string;
  generatedBy: string;
  sourceType: string;
  expectedSource: string;
  sourceRoutingRationale: string;
  mustIncludeFacts: string[];
  verifiedBy: string;
  contextChunkIds: string[];
}

interface EvalSetItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  questionCount: number;
  sourceTypeDistribution: Record<string, number>;
  status: string;
  errorMessage: string;
  metadata?: {
    qualityReport?: QualityReport;
    cleaned?: { deleted: number; remaining: number } | null;
  };
}

interface CheckResult {
  passed: boolean;
  detail: string;
  questions?: string[];
}

interface QualityReport {
  passed: boolean;
  totalQuestions: number;
  checks: {
    B1_count: CheckResult;
    B2_matrix: CheckResult;
    B3_query_quality: CheckResult;
    B4_answer_quality: CheckResult;
    B5_facts_quality: CheckResult;
    B10_no_duplicates: CheckResult;
  };
  warnings: string[];
  recommendation: string;
}

interface EvalConfigSummary {
  label: string;
  avgRecall: number;
  avgNdcg: number;
  avgFaithfulness: number;
  avgDurationMs: number;
  passRate: number;
  avgAnswerCorrectness: number;
  avgFactCoverage: number;
  avgSourceRoutingAccuracy: number;
  avgKbHitRate: number;
}

interface EvalReport {
  runId: string;
  timestamp: string;
  configs: EvalConfigSummary[];
  questionCount: number;
  reportJsonPath?: string;
  logPath?: string;
  judgeConfigs?: Array<{ providerId: string; modelId: string }>;
}

interface ReportListItem {
  id: string;
  timestamp: string;
  config_json: string;
  durationMs?: number;
  reportJsonPath?: string;
  logPath?: string;
  judgeConfigs?: Array<{ providerId: string; modelId: string }>;
}

/** 单条引用信息（含可选 URL 供 web 结果点击跳转） */
interface SourceCitation {
  title: string;
  url?: string;
  type: "knowledge" | "web";
}

// ── Component ────────────────────────────────────────────

export function OfflineEvalPanel() {
  // Summary data (for model config list in "运行评估")
  const [_summary, setSummary] = useState<SummaryRow[]>([]);

  // Offline eval state
  const [evalReports, setEvalReports] = useState<ReportListItem[]>([]);
  const [selectedReport, setSelectedReport] = useState<EvalReport | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [evalSuccess, setEvalSuccess] = useState<string | null>(null);

  // Model selection state
  const settings = useSettingsStore((s) => s.settings);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const availableProviders = settings.providers.filter(p => p.apiKeyRef);
  const evalConfig = settings.evalConfig ?? {};

  // 持久化的 eval 配置
  const generatorProviderId = evalConfig.generatorProviderId ?? "";
  const setGeneratorProviderId = (v: string) => setSettings({ ...settings, evalConfig: { ...evalConfig, generatorProviderId: v || undefined } });
  const generatorModel = evalConfig.generatorModel ?? "";
  const setGeneratorModel = (v: string) => setSettings({ ...settings, evalConfig: { ...evalConfig, generatorModel: v || undefined } });
  const questionCount = evalConfig.questionCount ?? 21;
  const setQuestionCount = (v: number) => setSettings({ ...settings, evalConfig: { ...evalConfig, questionCount: v !== 21 ? v : undefined } });
  const judgeConfigs = evalConfig.judgeConfigs ?? [];
  const setJudgeConfigs = (updater: Array<{ providerId: string; modelId: string }> | ((prev: Array<{ providerId: string; modelId: string }>) => Array<{ providerId: string; modelId: string }>)) => {
    const newVal = typeof updater === "function" ? updater(judgeConfigs) : updater;
    setSettings({ ...settings, evalConfig: { ...evalConfig, judgeConfigs: newVal.length > 0 ? newVal : undefined } });
  };
  const selectedEvalSet = evalConfig.selectedEvalSetId ?? null;
  const setSelectedEvalSet = (v: string | null) => setSettings({ ...settings, evalConfig: { ...evalConfig, selectedEvalSetId: v ?? undefined } });
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);

  // Comparison state
  const [compareMode, setCompareMode] = useState(false);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [comparisonData, setComparisonData] = useState<{ runs: Array<{ runId: string; timestamp: string; questionCount: number; configs: EvalConfigSummary[] }> } | null>(null);

  // Analysis state
  const [analysisData, setAnalysisData] = useState<{
    runId: string;
    breakdowns: {
      byCategory: Array<{ dimension: string; count: number; avgRecall: number; avgNdcg: number; avgFaithfulness: number; avgAnswerCorrectness: number; avgFactCoverage: number; avgSourceRoutingAccuracy: number }>;
      bySourceType: Array<{ dimension: string; count: number; avgRecall: number; avgNdcg: number; avgFaithfulness: number; avgAnswerCorrectness: number; avgFactCoverage: number; avgSourceRoutingAccuracy: number }>;
      byDifficulty: Array<{ dimension: string; count: number; avgRecall: number; avgNdcg: number; avgFaithfulness: number; avgAnswerCorrectness: number; avgFactCoverage: number; avgSourceRoutingAccuracy: number }>;
    };
    questionDetails?: Array<{
      goldenId: string; configLabel: string; query: string; category: string; sourceType: string; difficulty: string;
      expectedAnswer: string; expectedSources: string[]; mustIncludeFacts: string[];
      actualAnswer: string; actualSources: SourceCitation[];
      recallAtK: number | undefined; ndcgAtK: number | undefined; faithfulness: number;
      answerCorrectness: number; factCoverage: number; sourceRoutingAccuracy: number;
      durationMs: number; error?: string;
    }>;
    analysis?: {
      goldenSet: { totalQuestions: number; issues: string[]; status: string };
      execution: { issues: string[]; status: string };
      evalFlow: { issues: string[]; status: string };
      metrics: { issues: string[]; status: string };
    };
    questionAnalysis?: Array<{
      goldenId: string; query: string; category: string; sourceType: string; difficulty: string;
      isLow: boolean; issues: string[];
      goldenSays: string; actualAnswer: string; actualSources: SourceCitation[]; expectedSources: string[]; mustIncludeFacts: string[];
      scores: { recall: number | undefined; ndcg: number | undefined; faithfulness: number; answerCorrectness: number; factCoverage: number; routing: number };
      metricDiagnosis: string;
      metricDefs: string;
    }>;
    lowScoreItems?: Array<{
      goldenId: string; query: string; category: string; issue: string;
      goldenSays: string; actualAnswer: string; actualSources: SourceCitation[]; metricDiagnosis: string; metricDefs: string;
    }>;
  } | null>(null);
  const [expandedAnalysisQuestion, setExpandedAnalysisQuestion] = useState<string | null>(null);

  // Eval Set state
  const [evalSets, setEvalSets] = useState<EvalSetItem[]>([]);
  const [evalSetDetail, setEvalSetDetail] = useState<{ id: string; name: string; questions: GoldenQuestion[]; metadata?: EvalSetItem["metadata"] } | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Async task state
  interface ActiveTask {
    taskId: string;
    taskType: "generate" | "evaluate";
    status: string;
    progress: { current: number; total: number; phase: string; percent: number };
  }
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([]);
  const [notifications, setNotifications] = useState<TaskNotification[]>([]);
  const pollTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const reportDetailRef = useRef<HTMLDivElement>(null);

  // 是否有正在运行的评估任务
  const isEvalRunning = activeTasks.some(t => t.taskType === "evaluate" && t.status === "running");

  // ── Data fetching ──────────────────────────────────────

  const refreshSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/metrics/summary");
      if (res.ok) setSummary(await res.json());
    } catch { /* ignore */ }
  }, []);

  const refreshEvalReports = useCallback(async () => {
    try {
      const res = await fetch("/api/metrics/eval/reports");
      if (res.ok) setEvalReports(await res.json());
    } catch { /* ignore */ }
  }, []);

  const refreshEvalSets = useCallback(async () => {
    try {
      const res = await fetch("/api/metrics/eval-sets");
      if (res.ok) setEvalSets(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { refreshSummary(); }, [refreshSummary]);
  useEffect(() => { refreshEvalReports(); refreshEvalSets(); }, [refreshEvalReports, refreshEvalSets]);

  // Auto-scroll to report detail when it appears
  useEffect(() => {
    if (selectedReport) {
      setTimeout(() => reportDetailRef.current?.scrollIntoView({ behavior: "smooth" }), 150);
    }
  }, [selectedReport]);

  // SSE notifications
  useEffect(() => {
    connectNotifications();
    const unsub = onNotification((n) => {
      setNotifications(prev => [...prev, n]);
      setTimeout(() => {
        setNotifications(prev => prev.filter(x => x !== n));
      }, 3000);
      setActiveTasks(prev => prev.filter(t => t.taskId !== n.taskId));
      const timer = pollTimers.current.get(n.taskId);
      if (timer) {
        clearInterval(timer);
        pollTimers.current.delete(n.taskId);
      }
      if (n.taskType === "generate") {
        refreshEvalSets();
      } else if (n.taskType === "evaluate") {
        refreshEvalReports();
        if (n.type === "task-completed" && n.result) {
          const r = n.result as { runId?: string; questionCount?: number };
          if (r.questionCount) setEvalSuccess(`评估完成：${r.questionCount} 用例`);
          // Auto-load the new report
          if (r.runId) handleViewReport(r.runId);
        }
      }
    });
    return () => {
      unsub();
      disconnectNotifications();
      for (const timer of pollTimers.current.values()) clearInterval(timer);
      pollTimers.current.clear();
    };
  }, [refreshEvalSets, refreshEvalReports]);

  // ── Async task helpers ─────────────────────────────────

  const startPolling = useCallback((taskId: string, taskType: "generate" | "evaluate") => {
    // 避免重复添加同一个任务
    setActiveTasks(prev => {
      if (prev.some(t => t.taskId === taskId)) return prev;
      return [...prev, {
        taskId,
        taskType,
        status: "running",
        progress: { current: 0, total: 0, phase: "初始化", percent: 0 },
      }];
    });

    // 避免重复创建 polling timer
    if (pollTimers.current.has(taskId)) return;

    const timer = setInterval(async () => {
      try {
        const endpoint = taskType === "generate"
          ? `/api/metrics/eval-sets/generate-task/${taskId}/progress`
          : `/api/metrics/eval/tasks/${taskId}/progress`;
        const res = await fetch(endpoint);
        if (!res.ok) return;
        const data = await res.json() as { status: string; progress: ActiveTask["progress"]; error?: string };

        setActiveTasks(prev => prev.map(t =>
          t.taskId === taskId ? { ...t, status: data.status, progress: data.progress } : t
        ));

        if (data.status !== "running") {
          const t = pollTimers.current.get(taskId);
          if (t) { clearInterval(t); pollTimers.current.delete(taskId); }
        }
      } catch { /* ignore */ }
    }, 2000);

    pollTimers.current.set(taskId, timer);
  }, []);

  const handleCancelTask = useCallback(async (taskId: string, taskType: "generate" | "evaluate") => {
    try {
      const endpoint = taskType === "generate"
        ? `/api/metrics/eval-sets/generate-task/${taskId}/cancel`
        : `/api/metrics/eval/tasks/${taskId}/cancel`;
      await fetch(endpoint, { method: "POST" });
    } catch { /* ignore */ }
  }, []);

  // 恢复运行中的任务（切 tab 后重新 mount）
  useEffect(() => {
    const recoverTasks = async () => {
      try {
        const res = await fetch("/api/metrics/tasks");
        if (!res.ok) return;
        const tasks = await res.json() as Array<{ id: string; type: string; status: string }>;
        for (const t of tasks) {
          if (t.status === "running" || t.status === "pending") {
            startPolling(t.id, t.type as "generate" | "evaluate");
          }
        }
      } catch { /* ignore */ }
    };
    recoverTasks();
  }, [startPolling]);

  // ── Offline eval handlers ──────────────────────────────

  const handleGenerateGoldenSet = async () => {
    setEvalLoading(true);
    setEvalError(null);
    setEvalSuccess(null);
    try {
      const body: Record<string, unknown> = {
        name: `Golden Set ${new Date().toLocaleString()}`,
      };
      if (generatorProviderId) body.generatorProviderId = generatorProviderId;
      if (generatorModel) body.generatorModel = generatorModel;
      if (questionCount !== 21) body.questionCount = questionCount;

      const res = await fetch("/api/metrics/eval-sets/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || "生成失败");
      }
      const { taskId } = await res.json() as { taskId: string };
      setEvalSuccess("评估集生成已启动，完成后会通知您");
      startPolling(taskId, "generate");
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setEvalLoading(false);
    }
  };

  const handleRunEval = async () => {
    if (!currentPipelineConfig.providerId || !currentPipelineConfig.modelId) {
      setEvalError("请先在「功能分配」中配置 chat agent 的 LLM 模型");
      return;
    }
    const configs = [{
      label: `${currentPipelineConfig.llm} + ${currentPipelineConfig.webSearch} + ${currentPipelineConfig.embedding} + ${currentPipelineConfig.reranker}`,
      providerId: currentPipelineConfig.providerId,
      modelId: currentPipelineConfig.modelId,
    }];
    setEvalLoading(true);
    setEvalError(null);
    setEvalSuccess(null);
    try {
      const body: Record<string, unknown> = {
        configs,
        evalSetId: selectedEvalSet || undefined,
      };
      if (judgeConfigs.length > 0) body.judgeConfigs = judgeConfigs;

      const res = await fetch("/api/metrics/eval/run-async", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || "评估失败");
      }
      const { taskId } = await res.json() as { taskId: string };
      setEvalSuccess("评估已启动，完成后会通知您");
      startPolling(taskId, "evaluate");
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : "评估失败");
    } finally {
      setEvalLoading(false);
    }
  };

  const handleViewReport = async (reportId: string) => {
    try {
      const res = await fetch(`/api/metrics/eval/reports/${reportId}`);
      if (res.ok) {
        const report = await res.json() as EvalReport;
        setSelectedReport(report);
        setEvalSuccess(`报告已加载：${reportId}，用例数: ${report.questionCount}`);
      } else {
        const data = await res.json() as { error?: string };
        setEvalError(data.error || `加载报告失败 (${res.status})`);
      }
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : "加载报告失败");
    }
  };

  // ── Comparison & Analysis ──────────────────────────────

  const handleToggleCompare = (runId: string) => {
    setSelectedRunIds(prev =>
      prev.includes(runId) ? prev.filter(id => id !== runId) : [...prev, runId]
    );
  };

  const handleCompare = async () => {
    if (selectedRunIds.length < 2) {
      setEvalError("请至少选择 2 个报告进行比较");
      return;
    }
    try {
      const res = await fetch(`/api/metrics/eval/compare?runIds=${selectedRunIds.join(",")}`);
      if (res.ok) {
        const data = await res.json() as { runs: Array<{ runId: string; timestamp: string; questionCount: number; configs: EvalConfigSummary[] }> };
        setComparisonData(data);
        setEvalSuccess(`已加载 ${data.runs.length} 个报告的比较数据`);
      }
    } catch { /* ignore */ }
  };

  const handleViewAnalysis = async (reportId: string) => {
    try {
      const res = await fetch(`/api/metrics/eval/reports/${reportId}/analysis`);
      if (res.ok) {
        const data = await res.json() as {
          runId: string;
          breakdowns: {
            byCategory: Array<{ dimension: string; count: number; avgRecall: number; avgNdcg: number; avgFaithfulness: number; avgAnswerCorrectness: number; avgFactCoverage: number; avgSourceRoutingAccuracy: number }>;
            bySourceType: Array<{ dimension: string; count: number; avgRecall: number; avgNdcg: number; avgFaithfulness: number; avgAnswerCorrectness: number; avgFactCoverage: number; avgSourceRoutingAccuracy: number }>;
            byDifficulty: Array<{ dimension: string; count: number; avgRecall: number; avgNdcg: number; avgFaithfulness: number; avgAnswerCorrectness: number; avgFactCoverage: number; avgSourceRoutingAccuracy: number }>;
          };
        };
        setAnalysisData(data);
        setEvalSuccess(`分析报告已加载`);
      }
    } catch { /* ignore */ }
  };

  const handleDeleteReport = async (reportId: string) => {
    if (!confirm("确定删除此评估报告？")) return;
    try {
      await fetch(`/api/metrics/eval/reports/${reportId}`, { method: "DELETE" });
      if (selectedReport?.runId === reportId) setSelectedReport(null);
      if (analysisData?.runId === reportId) setAnalysisData(null);
      setEvalSuccess("评估报告已删除");
      await refreshEvalReports();
    } catch { /* ignore */ }
  };

  // ── Eval Set handlers ──────────────────────────────────

  const handleImportEvalSet = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setEvalLoading(true);
      setEvalError(null);
      try {
        const text = await file.text();
        const data = JSON.parse(text) as { questions?: unknown[] } | unknown[];
        const questions = Array.isArray(data) ? data : (data as { questions: unknown[] }).questions;
        if (!questions || !Array.isArray(questions) || questions.length === 0) {
          throw new Error("JSON 文件中未找到 questions 数组");
        }
        const res = await fetch("/api/metrics/eval-sets/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name.replace(/\.json$/i, ""), questions }),
        });
        if (!res.ok) {
          const errData = await res.json() as { error?: string };
          throw new Error(errData.error || "导入失败");
        }
        const result = await res.json() as { id: string; count: number };
        setEvalSuccess(`导入成功：${result.count} 用例 (ID: ${result.id.slice(0, 16)}...)`);
        await refreshEvalSets();
      } catch (err) {
        setEvalError(err instanceof Error ? err.message : "导入失败");
      } finally {
        setEvalLoading(false);
      }
    };
    input.click();
  };

  const handleRenameEvalSet = async (id: string) => {
    if (!renameValue.trim()) return;
    try {
      await fetch(`/api/metrics/eval-sets/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      setRenameId(null);
      setRenameValue("");
      await refreshEvalSets();
    } catch { /* ignore */ }
  };

  const handleDeleteEvalSet = async (id: string) => {
    if (!confirm("确定删除此 Eval Set？关联的所有评估用例也将被删除。")) return;
    setEvalLoading(true);
    setEvalError(null);
    try {
      await fetch(`/api/metrics/eval-sets/${id}`, { method: "DELETE" });
      if (selectedEvalSet === id) {
        setSelectedEvalSet(null);
        setEvalSetDetail(null);
      }
      setEvalSuccess("Eval Set 已删除");
      await refreshEvalSets();
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setEvalLoading(false);
    }
  };

  const handleViewEvalSet = async (id: string) => {
    setSelectedEvalSet(id);
    try {
      const res = await fetch(`/api/metrics/eval-sets/${id}`);
      if (res.ok) {
        const data = await res.json() as { id: string; name: string; questions: GoldenQuestion[]; metadata?: EvalSetItem["metadata"] };
        setEvalSetDetail(data);
      }
    } catch { /* ignore */ }
  };

  const handleRunQualityCheck = async (evalSetId: string) => {
    setEvalLoading(true);
    setEvalError(null);
    setEvalSuccess(null);
    try {
      const res = await fetch(`/api/metrics/eval-sets/${evalSetId}/quality-check`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || "质量检查失败");
      }
      const data = await res.json() as { qualityReport: QualityReport; status: string };
      setEvalSuccess(`质量检查完成: ${data.qualityReport.recommendation}`);
      await refreshEvalSets();
      // 刷新详情
      await handleViewEvalSet(evalSetId);
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : "质量检查失败");
    } finally {
      setEvalLoading(false);
    }
  };

  // ── 当前用户配置的管道组合（从 settings 读取）─────────

  const currentPipelineConfig = (() => {
    // LLM: chat agent 的配置，fallback 到第一个 enabled 的 provider（与 AgentsAssignmentPanel 一致）
    const chatAgent = settings.agents.find(a => a.agent === "chat");
    let llmProviderId = chatAgent?.providerOrder?.[0] ?? "";
    let llmModelId = chatAgent?.modelId ?? "";
    if (!llmProviderId) {
      const enabledProvider = settings.providers.find(p => p.enabled);
      if (enabledProvider) {
        llmProviderId = enabledProvider.providerId;
        llmModelId = llmModelId || enabledProvider.defaultModelId || "";
      }
    }
    if (!llmModelId && llmProviderId) {
      const prov = settings.providers.find(p => p.providerId === llmProviderId);
      llmModelId = prov?.defaultModelId || "";
    }

    // Web Search: MCP server 硬编码使用 serper.dev
    const webSearchProvider = settings.searchProviders.find(
      sp => sp.providerId === "serper" && sp.enabled && sp.apiKeyRef
    );
    const webSearchLabel = webSearchProvider ? "serper.dev" : "未配置";

    // Reranker
    const reranker = settings.knowledgeProviders?.find(p => p.providerType === "reranker" && p.enabled);
    const rerankerLabel = reranker ? `${reranker.providerId} / ${reranker.modelId}` : "未配置";

    // Embedding
    const embedding = settings.knowledgeProviders?.find(p => p.providerType === "embedding" && p.enabled);
    const embeddingLabel = embedding ? `${embedding.providerId} / ${embedding.modelId}` : "未配置";

    const llmLabel = llmProviderId && llmModelId ? `${llmProviderId} / ${llmModelId}` : "未配置";

    return {
      llm: llmLabel,
      webSearch: webSearchLabel,
      embedding: embeddingLabel,
      reranker: rerankerLabel,
      providerId: llmProviderId,
      modelId: llmModelId,
    };
  })();

  return (
    <div className="offline-eval-panel" data-testid="offline-eval-panel">
      {/* Notification Toasts */}
      {notifications.length > 0 && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
          {notifications.map((n, i) => (
            <div
              key={`${n.taskId}-${i}`}
              style={{
                padding: "12px 16px",
                borderRadius: 8,
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                color: "#fff",
                fontSize: 14,
                maxWidth: 360,
                background: n.type === "task-completed" ? "#4caf50" : n.type === "task-error" ? "#f44336" : "#ff9800",
              }}
              data-testid={`notification-${n.type}`}
            >
              <strong>{n.taskType === "generate" ? "Eval Set 生成" : "离线评估"}</strong>
              {" — "}
              {n.type === "task-completed" && n.taskType === "evaluate" && (n.result as { reportJsonPath?: string })?.reportJsonPath
                ? `完成：${(n.result as { questionCount: number }).questionCount} 用例（报告已保存）`
                : n.type === "task-completed" && (n.result as { questionCount?: number })?.questionCount
                ? `完成：${(n.result as { questionCount: number }).questionCount} 用例`
                : n.type === "task-error"
                  ? `失败：${n.error || "未知错误"}`
                  : "已取消"}
            </div>
          ))}
        </div>
      )}

      {/* Active Task Progress Bars */}
      {activeTasks.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {activeTasks.map((task) => (
            <div key={task.taskId} style={{ marginBottom: 8 }} data-testid={`progress-${task.taskType}`}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13 }}>
                  {task.taskType === "generate" ? "生成 Eval Set" : "运行评估"} — {task.progress.phase}
                </span>
                <span style={{ fontSize: 12, color: "#666" }}>
                  {task.progress.current}/{task.progress.total} ({task.progress.percent}%)
                  {task.status === "running" && (
                    <button
                      type="button"
                      onClick={() => handleCancelTask(task.taskId, task.taskType)}
                      style={{ marginLeft: 8, fontSize: 12, color: "#f44336", background: "none", border: "1px solid #f44336", borderRadius: 4, padding: "1px 6px", cursor: "pointer" }}
                      data-testid={`cancel-${task.taskType}`}
                    >
                      取消
                    </button>
                  )}
                </span>
              </div>
              <div style={{ background: "#e0e0e0", borderRadius: 4, height: 8, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${task.progress.percent}%`,
                    height: "100%",
                    background: task.status === "error" ? "#f44336" : task.status === "cancelled" ? "#ff9800" : "#4caf50",
                    transition: "width 0.3s",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <h2>离线评估</h2>

      {evalError && <div className="metrics-error" data-testid="eval-error">{evalError}</div>}
      {evalSuccess && <div className="metrics-success" data-testid="eval-success">{evalSuccess}</div>}

      {/* Eval Set Management */}
      <div className="offline-eval__section">
        <h4>评估集</h4>

        {/* Generator Model Selector */}
        <div style={{ marginBottom: 12, padding: 8, background: "var(--color-bg-subtle, #f5f5f5)", borderRadius: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>生成新评估集</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12 }}>
              Provider:
              <select
                value={generatorProviderId}
                onChange={(e) => {
                  setGeneratorProviderId(e.target.value);
                  setGeneratorModel("");
                }}
                style={{ marginLeft: 4 }}
                data-testid="generator-provider"
              >
                <option value="">默认（MiMo）</option>
                {availableProviders.map(p => (
                  <option key={p.providerId} value={p.providerId}>{p.providerId}</option>
                ))}
              </select>
            </label>
            {generatorProviderId && (() => {
              const selectedProvider = availableProviders.find(p => p.providerId === generatorProviderId);
              const models = [
                ...(selectedProvider?.defaultModelId ? [selectedProvider.defaultModelId] : []),
                ...((selectedProvider?.modelIds ?? []).filter(m => m !== selectedProvider?.defaultModelId)),
              ];
              return (
                <label style={{ fontSize: 12 }}>
                  模型:
                  <select
                    value={generatorModel}
                    onChange={(e) => setGeneratorModel(e.target.value)}
                    style={{ marginLeft: 4 }}
                    data-testid="generator-model"
                  >
                    <option value="">默认</option>
                    {models.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </label>
              );
            })()}
            <label style={{ fontSize: 12 }}>
              用例数:
              <input
                type="number"
                min={5}
                max={50}
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value) || 21)}
                style={{ marginLeft: 4, width: 50 }}
                data-testid="question-count"
              />
            </label>
            <button type="button" onClick={handleGenerateGoldenSet} disabled={evalLoading} data-testid="evalset-generate">
              {evalLoading ? "生成中..." : "生成"}
            </button>
          </div>
        </div>

        <div className="offline-eval__actions" style={{ marginBottom: 12 }}>
          <button type="button" onClick={handleImportEvalSet} disabled={evalLoading} data-testid="evalset-import">
            从 JSON 文件导入
          </button>
        </div>
        {evalSets.length > 0 ? (
          <div className="metrics-table-wrap">
            <table className="metrics-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>名称</th>
                  <th>评估用例数</th>
                  <th>类型分布</th>
                  <th>状态</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {evalSets.map((es) => (
                  <tr key={es.id} style={selectedEvalSet === es.id ? { backgroundColor: "var(--color-bg-selected, #e8f0fe)" } : undefined}>
                    <td style={{ fontSize: 12, fontFamily: "monospace" }}>{es.id}</td>
                    <td>
                      {renameId === es.id ? (
                        <span>
                          <input
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleRenameEvalSet(es.id); if (e.key === "Escape") { setRenameId(null); setRenameValue(""); } }}
                            style={{ width: 160 }}
                            autoFocus
                          />
                          <button type="button" onClick={() => handleRenameEvalSet(es.id)} style={{ marginLeft: 4 }}>✓</button>
                          <button type="button" onClick={() => { setRenameId(null); setRenameValue(""); }} style={{ marginLeft: 2 }}>✗</button>
                        </span>
                      ) : (
                        <span>{es.name || es.id} <button type="button" onClick={() => { setRenameId(es.id); setRenameValue(es.name || es.id); }} style={{ fontSize: 12, padding: "0 4px" }}>✏️</button></span>
                      )}
                    </td>
                    <td>{es.questionCount}</td>
                    <td style={{ fontSize: 12 }}>
                      {Object.entries(es.sourceTypeDistribution).map(([k, v]) => `${k}:${v}`).join(", ")}
                    </td>
                    <td title={es.metadata?.qualityReport?.recommendation || es.status}>
                      {es.status === "generating" ? "⏳"
                        : es.status === "failed" ? "❌"
                        : es.status === "degraded" ? `⚠️ 已清理`
                        : es.metadata?.qualityReport?.passed ? "✅ 合格"
                        : es.metadata?.qualityReport ? "⚠️"
                        : "✅"}
                    </td>
                    <td style={{ fontSize: 12 }}>{formatLocalTime(es.createdAt)}</td>
                    <td>
                      <button type="button" onClick={() => handleViewEvalSet(es.id)} data-testid={`evalset-view-${es.id.slice(0, 16)}`}>查看</button>
                      <button type="button" onClick={() => handleDeleteEvalSet(es.id)} style={{ marginLeft: 4, color: "var(--color-error, #d32f2f)" }}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="metrics-hint">暂无评估集。生成或从 JSON 文件导入。</p>
        )}
        {/* Eval Set Detail */}
        {evalSetDetail && (
          <div style={{ marginTop: 12 }}>
            <h5>
              评估集详情：{evalSetDetail.name} ({evalSetDetail.questions.length} 用例)
              <button type="button" onClick={() => setEvalSetDetail(null)} style={{ marginLeft: 12, fontSize: 12, padding: "2px 8px" }}>收起</button>
            </h5>

            {/* Quality Report Card */}
            <div style={{ marginBottom: 12, padding: 12, background: "var(--color-bg-subtle, #f5f5f5)", borderRadius: 6, fontSize: 13 }}>
              {(() => {
                const qr = evalSetDetail.metadata?.qualityReport;
                if (!qr) {
                  return <div style={{ color: "#999", marginBottom: 8 }}>未运行质量检查</div>;
                }
                const checkLabels: Record<string, string> = {
                  B1_count: "B1 评估用例数",
                  B2_matrix: "B2 矩阵覆盖",
                  B3_query_quality: "B3 Query 质量",
                  B4_answer_quality: "B4 答案质量",
                  B5_facts_quality: "B5 事实点",
                  B10_no_duplicates: "B10 无重复",
                };
                const cleaned = evalSetDetail.metadata?.cleaned;
                return (
                  <>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>
                      质量报告
                      <span style={{ marginLeft: 12, fontWeight: 400, color: qr.passed ? "#4caf50" : "#ff9800" }}>
                        {qr.recommendation}
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "4px 16px", marginBottom: 8 }}>
                      {Object.entries(qr.checks).map(([key, check]) => (
                        <div key={key} style={{ color: check.passed ? "#4caf50" : "#f44336" }}>
                          {check.passed ? "✅" : "⚠️"} {checkLabels[key] || key}: {check.detail}
                        </div>
                      ))}
                    </div>
                    {cleaned && cleaned.deleted > 0 && (
                      <div style={{ color: "#ff9800", fontSize: 12, marginBottom: 8 }}>
                        已清理 {cleaned.deleted} 条不合格用例，剩余 {cleaned.remaining} 条
                      </div>
                    )}
                    {qr.warnings.length > 0 && (
                      <details style={{ marginBottom: 8, fontSize: 12, color: "#666" }}>
                        <summary>警告详情 ({qr.warnings.length})</summary>
                        <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                          {qr.warnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      </details>
                    )}
                  </>
                );
              })()}
              <button
                type="button"
                onClick={() => handleRunQualityCheck(evalSetDetail.id)}
                disabled={evalLoading}
                style={{ fontSize: 12, padding: "2px 8px" }}
                data-testid="quality-check-run"
              >
                {evalSetDetail.metadata?.qualityReport ? "重新运行质量检查" : "运行质量检查"}
              </button>
            </div>

            <div className="metrics-table-wrap" style={{ maxHeight: 500, overflow: "auto" }}>
              <table className="metrics-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Query</th>
                    <th>分类</th>
                    <th>难度</th>
                    <th>来源</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {evalSetDetail.questions.map((q, i) => (
                    <Fragment key={q.id}>
                      <tr>
                        <td>{i + 1}</td>
                        <td style={{ maxWidth: 350, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={q.query}>{q.query}</td>
                        <td>{q.category}</td>
                        <td>{q.difficulty}</td>
                        <td>{q.sourceType || "-"}</td>
                        <td>
                          <button type="button" onClick={() => setExpandedQuestionId(expandedQuestionId === q.id ? null : q.id)} style={{ fontSize: 12, padding: "1px 6px" }}>
                            {expandedQuestionId === q.id ? "折叠" : "详情"}
                          </button>
                        </td>
                      </tr>
                      {expandedQuestionId === q.id && (
                        <tr>
                          <td colSpan={6} style={{ background: "var(--color-bg-subtle, #f9f9f9)", padding: 12, fontSize: 13 }}>
                            <div style={{ marginBottom: 6 }}><strong>Query:</strong> {q.query}</div>
                            <div style={{ marginBottom: 6 }}><strong>Expected Answer:</strong> {q.expectedAnswer || "-"}</div>
                            {q.mustIncludeFacts && q.mustIncludeFacts.length > 0 && (
                              <div style={{ marginBottom: 6, fontSize: 12, color: "#666" }}><strong>Must Include:</strong> {q.mustIncludeFacts.join("; ")}</div>
                            )}
                            {q.expectedArticles && q.expectedArticles.length > 0 && (
                              <div style={{ fontSize: 12, color: "#666" }}><strong>法条:</strong> {q.expectedArticles.join(", ")}</div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Run Evaluation */}
      <div className="offline-eval__section">
        <h4>运行评估</h4>

        {/* Eval Set Selector */}
        {evalSets.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>
              评估集:
              <select
                value={selectedEvalSet ?? ""}
                onChange={(e) => setSelectedEvalSet(e.target.value || null)}
                style={{ marginLeft: 8, minWidth: 280 }}
                data-testid="eval-set-selector"
              >
                <option value="">全部</option>
                {evalSets.map(es => (
                  <option key={es.id} value={es.id}>
                    {es.name || es.id} ({es.questionCount} 用例)
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* Judge Model Selector */}
        <div style={{ marginBottom: 12, padding: 8, background: "var(--color-bg-subtle, #f5f5f5)", borderRadius: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            Judge 模型配置（可选，最多 3 个）
            {judgeConfigs.length === 0 ? (
              <span style={{ fontWeight: 400, color: "#666", marginLeft: 8 }}>
                默认：mimo/mimo-v2.5 + bailian/MiniMax-M2.5
              </span>
            ) : (
              <span style={{ fontWeight: 400, color: "#1565c0", marginLeft: 8 }}>
                已选：{judgeConfigs.map(j => `${j.providerId}/${j.modelId || "?"}`).join(" + ")}
              </span>
            )}
          </div>
          {/* 已选 judges 列表 */}
          {judgeConfigs.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {judgeConfigs.map((j, i) => (
                <span key={i} style={{ fontSize: 11, background: "#e3f2fd", borderRadius: 4, padding: "2px 8px", border: "1px solid #90caf9", display: "flex", alignItems: "center", gap: 4 }}>
                  {j.providerId}/{j.modelId || "?"}
                  <button type="button" onClick={() => setJudgeConfigs(prev => prev.filter((_, idx) => idx !== i))} style={{ fontSize: 10, color: "#d32f2f", cursor: "pointer", border: "none", background: "none" }}>✕</button>
                </span>
              ))}
            </div>
          )}
          {/* 添加 judge */}
          {judgeConfigs.length < 3 && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "#666" }}>添加：</span>
              {availableProviders.map(p => {
                const models = [
                  ...(p.defaultModelId ? [p.defaultModelId] : []),
                  ...((p.modelIds ?? []).filter(m => m !== p.defaultModelId)),
                ];
                return models.map(m => (
                  <button
                    key={`${p.providerId}-${m}`}
                    type="button"
                    disabled={judgeConfigs.some(j => j.providerId === p.providerId && j.modelId === m)}
                    onClick={() => setJudgeConfigs(prev => [...prev, { providerId: p.providerId, modelId: m }])}
                    style={{
                      fontSize: 10,
                      padding: "2px 6px",
                      cursor: judgeConfigs.some(j => j.providerId === p.providerId && j.modelId === m) ? "default" : "pointer",
                      opacity: judgeConfigs.some(j => j.providerId === p.providerId && j.modelId === m) ? 0.4 : 1,
                      background: judgeConfigs.some(j => j.providerId === p.providerId && j.modelId === m) ? "#eee" : "#fff",
                      border: "1px solid #ccc",
                      borderRadius: 3,
                    }}
                  >
                    {p.providerId}/{m}
                  </button>
                ));
              })}
            </div>
          )}
        </div>

        <div>
          <p className="metrics-hint">将使用以下配置运行评估：</p>
          <table style={{ margin: "4px 0 12px 0", fontSize: 13, borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ padding: "2px 12px 2px 0", fontWeight: 600, color: "#666" }}>LLM</td>
                <td style={{ padding: "2px 0" }}>{currentPipelineConfig.llm}</td>
              </tr>
              <tr>
                <td style={{ padding: "2px 12px 2px 0", fontWeight: 600, color: "#666" }}>Web Search</td>
                <td style={{ padding: "2px 0" }}>{currentPipelineConfig.webSearch}</td>
              </tr>
              <tr>
                <td style={{ padding: "2px 12px 2px 0", fontWeight: 600, color: "#666" }}>Embedding</td>
                <td style={{ padding: "2px 0" }}>{currentPipelineConfig.embedding}</td>
              </tr>
              <tr>
                <td style={{ padding: "2px 12px 2px 0", fontWeight: 600, color: "#666" }}>Reranker</td>
                <td style={{ padding: "2px 0" }}>{currentPipelineConfig.reranker}</td>
              </tr>
            </tbody>
          </table>
          <button
            type="button"
            onClick={handleRunEval}
            disabled={evalLoading || isEvalRunning || evalSets.length === 0 || !currentPipelineConfig.providerId}
            data-testid="eval-run"
          >
            {evalLoading || isEvalRunning ? "评估中..." : "开始评估"}
          </button>
        </div>
      </div>

      {/* Selected Report Detail */}
      {selectedReport && (
        <div className="offline-eval__section" ref={reportDetailRef} data-testid="eval-report-detail">
          <h4>评估结果</h4>
          {(selectedReport.reportJsonPath || selectedReport.logPath) && (
            <div style={{ marginBottom: 12, padding: 8, background: "var(--color-bg-subtle, #f5f5f5)", borderRadius: 6, fontSize: 12, fontFamily: "monospace" }}>
              {selectedReport.reportJsonPath && <div>📄 报告 JSON: {selectedReport.reportJsonPath}</div>}
              {selectedReport.logPath && <div>📋 日志文件: {selectedReport.logPath}</div>}
            </div>
          )}
          <p>评估用例数: {selectedReport.questionCount} | 时间: {formatLocalTime(selectedReport.timestamp)}{selectedReport.judgeConfigs && selectedReport.judgeConfigs.length > 0 && <> | Judge: {selectedReport.judgeConfigs.map(j => `${j.providerId}/${j.modelId}`).join(" + ")}</>}</p>
          <div className="metrics-table-wrap">
            <table className="metrics-table">
              <thead>
                <tr>
                  <th>配置</th>
                  <th>Recall@K</th>
                  <th>NDCG@K</th>
                  <th>Faithfulness</th>
                  <th>答案正确性</th>
                  <th>事实覆盖</th>
                  <th>路由准确</th>
                  <th>KB Hit</th>
                  <th>通过率</th>
                </tr>
              </thead>
              <tbody>
                {selectedReport.configs.map((c) => (
                  <tr key={c.label}>
                    <td style={{ fontSize: 12, whiteSpace: "pre-line" }}>
                      {c.label.split(" + ").join("\n")}{selectedReport.judgeConfigs && selectedReport.judgeConfigs.length > 0 ? `\njudge: ${selectedReport.judgeConfigs.map(j => `${j.providerId} / ${j.modelId}`).join(" + ")}` : ""}
                    </td>
                    <td>{c.avgRecall.toFixed(3)}</td>
                    <td>{c.avgNdcg.toFixed(3)}</td>
                    <td>{c.avgFaithfulness.toFixed(3)}</td>
                    <td>{(c.avgAnswerCorrectness ?? 0).toFixed(3)}</td>
                    <td>{(c.avgFactCoverage ?? 0).toFixed(3)}</td>
                    <td>{(c.avgSourceRoutingAccuracy ?? 0).toFixed(3)}</td>
                    <td>{(c.avgKbHitRate ?? 0).toFixed(3)}</td>
                    <td>{(c.passRate * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Historical Reports */}
      {evalReports.length > 0 && (
        <div className="offline-eval__section">
          <h4>
            历史报告
            <button
              type="button"
              onClick={() => { setCompareMode(!compareMode); setSelectedRunIds([]); setComparisonData(null); setAnalysisData(null); }}
              style={{ marginLeft: 12, fontSize: 12, padding: "2px 8px" }}
              data-testid="compare-toggle"
            >
              {compareMode ? "退出比较" : "比较模式"}
            </button>
          </h4>
          <div className="metrics-table-wrap">
            <table className="metrics-table">
              <thead>
                <tr>
                  {compareMode && <th>选择</th>}
                  <th>ID</th>
                  <th>评估模型</th>
                  <th>Judge</th>
                  <th>时间</th>
                  <th>耗时</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {evalReports.map((r) => {
                  // 从 config_json 提取评估模型（第一段 label，取 provider/model 部分）
                  let evalModel = "-";
                  try {
                    const cfg = JSON.parse(r.config_json);
                    if (cfg?.label) {
                      const parts = cfg.label.split(" + ");
                      evalModel = parts[0] ?? "-"; // e.g. "bailian / MiniMax-M2.5"
                    }
                  } catch { /* ignore */ }
                  const judgeLabel = r.judgeConfigs && r.judgeConfigs.length > 0
                    ? r.judgeConfigs.map(j => `${j.providerId}/${j.modelId}`).join(" + ")
                    : "default";
                  return (
                  <tr key={r.id}>
                    {compareMode && (
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedRunIds.includes(r.id)}
                          onChange={() => handleToggleCompare(r.id)}
                        />
                      </td>
                    )}
                    <td style={{ fontSize: 12, fontFamily: "monospace" }} title={r.id}>{r.id}</td>
                    <td style={{ fontSize: 12 }} title={evalModel}>{evalModel}</td>
                    <td style={{ fontSize: 12 }}>{judgeLabel}</td>
                    <td>{formatLocalTime(r.timestamp)}</td>
                    <td style={{ fontSize: 12 }}>{r.durationMs ? formatDuration(r.durationMs) : "-"}</td>
                    <td>
                      <button type="button" onClick={() => handleViewReport(r.id)} data-testid={`view-report-${r.id.slice(0, 8)}`}>
                        查看
                      </button>
                      <button type="button" onClick={() => handleViewAnalysis(r.id)} style={{ marginLeft: 4 }} data-testid={`analysis-${r.id.slice(0, 8)}`}>
                        分析
                      </button>
                      <button type="button" onClick={() => handleDeleteReport(r.id)} style={{ marginLeft: 4, color: "var(--color-error, #d32f2f)" }} data-testid={`delete-report-${r.id.slice(0, 8)}`}>
                        删除
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {compareMode && selectedRunIds.length >= 2 && (
            <button
              type="button"
              onClick={handleCompare}
              style={{ marginTop: 8 }}
              data-testid="compare-run"
            >
              比较 {selectedRunIds.length} 个报告
            </button>
          )}
        </div>
      )}

      {/* Comparison View */}
      {comparisonData && comparisonData.runs.length >= 2 && (
        <div className="offline-eval__section">
          <h4>比较结果 ({comparisonData.runs.length} 个报告)</h4>
          <div className="metrics-table-wrap">
            <table className="metrics-table">
              <thead>
                <tr>
                  <th>指标</th>
                  {comparisonData.runs.map(run => (
                    <th key={run.runId} style={{ fontSize: 12, whiteSpace: "nowrap" }}>{run.runId}<br /><span style={{ fontSize: 11, color: "#666" }}>{formatLocalTime(run.timestamp)}</span></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonData.runs[0]?.configs[0] && Object.keys(comparisonData.runs[0].configs[0]).filter(k => k !== "label").map(metricKey => (
                  <tr key={metricKey}>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{metricLabel(metricKey)}</td>
                    {comparisonData.runs.map(run => {
                      const val = run.configs[0]?.[metricKey as keyof EvalConfigSummary] as number ?? 0;
                      const allVals = comparisonData.runs.map(r => r.configs[0]?.[metricKey as keyof EvalConfigSummary] as number ?? 0);
                      // 耗时越少越好，其他指标越高越好
                      const isLowerBetter = metricKey === "avgDurationMs";
                      const bestVal = isLowerBetter ? Math.min(...allVals.filter(v => v > 0)) : Math.max(...allVals);
                      const isBest = val === bestVal && val > 0;
                      return (
                        <td key={run.runId} style={{ color: isBest ? "#4caf50" : undefined, fontWeight: isBest ? 700 : 400 }}>
                          {formatMetricValue(metricKey, val)}
                          {isBest && " ✓"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Analysis View */}
      {analysisData && (
        <div className="offline-eval__section" data-testid="eval-analysis-detail">
          <h4>
            分析报告 — {analysisData.runId}
            <button
              type="button"
              onClick={() => { setAnalysisData(null); setExpandedAnalysisQuestion(null); }}
              style={{ marginLeft: 12, fontSize: 12, padding: "2px 8px" }}
            >
              收起
            </button>
          </h4>

          {/* 四角度分析 */}
          {analysisData.analysis && (
            <div style={{ marginBottom: 16, padding: 12, background: "var(--color-bg-subtle, #f5f5f5)", borderRadius: 6, fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>四角度诊断</div>
              {([
                { key: "goldenSet", label: "(a) Golden Set", data: analysisData.analysis.goldenSet },
                { key: "execution", label: "(b) Answer & Citation 执行", data: analysisData.analysis.execution },
                { key: "evalFlow", label: "(c) 离线评估流程", data: analysisData.analysis.evalFlow },
                { key: "metrics", label: "(d) Metrics 异常", data: analysisData.analysis.metrics },
              ] as const).map(({ key, label, data }) => (
                <div key={key} style={{ marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, color: data.status === "OK" ? "#4caf50" : "#f44336" }}>
                    {data.status === "OK" ? "✅" : "⚠️"} {label}: {data.status}
                  </span>
                  {data.issues.length > 0 && (
                    <ul style={{ margin: "2px 0 0 20px", padding: 0, color: "#666" }}>
                      {data.issues.map((issue, i) => <li key={i}>{issue}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 逐题详细分析 */}
          {analysisData.questionAnalysis && analysisData.questionAnalysis.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h5>逐例分析 ({analysisData.questionAnalysis.length} 用例，{analysisData.questionAnalysis.filter(q => q.isLow).length} 项低分)</h5>
              <div className="metrics-table-wrap" style={{ maxHeight: 700, overflow: "auto" }}>
                <table className="metrics-table">
                  <thead style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--color-bg-primary, #fff)" }}>
                    <tr>
                      <th>#</th>
                      <th>Query</th>
                      <th>分类</th>
                      <th>来源</th>
                      <th>Recall</th>
                      <th>NDCG</th>
                      <th>Faith</th>
                      <th>正确</th>
                      <th>覆盖</th>
                      <th>路由</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysisData.questionAnalysis.map((item, i) => (
                      <Fragment key={item.goldenId}>
                        <tr style={item.isLow ? { background: "rgba(244,67,54,0.05)" } : undefined}>
                          <td>{i + 1}</td>
                          <td style={{ maxWidth: 500, whiteSpace: "normal", wordBreak: "break-word", fontSize: 12 }}>{item.query}</td>
                          <td>{item.category}</td>
                          <td style={{ fontSize: 11 }}>{item.sourceType}</td>
                          <td style={{ color: (item.scores.recall ?? 1) < 0.5 ? "#f44336" : undefined }}>{item.scores.recall?.toFixed(2) ?? "-"}</td>
                          <td style={{ color: (item.scores.ndcg ?? 1) < 0.5 ? "#f44336" : undefined }}>{item.scores.ndcg?.toFixed(2) ?? "-"}</td>
                          <td style={{ color: item.scores.faithfulness < 0.8 ? "#f44336" : undefined }}>{item.scores.faithfulness.toFixed(2)}</td>
                          <td style={{ color: item.scores.answerCorrectness < 0.8 ? "#f44336" : undefined }}>{item.scores.answerCorrectness.toFixed(2)}</td>
                          <td style={{ color: item.scores.factCoverage < 0.8 ? "#f44336" : undefined }}>{item.scores.factCoverage.toFixed(2)}</td>
                          <td style={{ color: item.scores.routing < 1 ? "#f44336" : undefined }}>{item.scores.routing.toFixed(2)}</td>
                          <td>
                            <button type="button" onClick={() => setExpandedAnalysisQuestion(expandedAnalysisQuestion === item.goldenId ? null : item.goldenId)} style={{ fontSize: 12, padding: "1px 6px" }}>
                              {expandedAnalysisQuestion === item.goldenId ? "折叠" : "详情"}
                            </button>
                          </td>
                        </tr>
                        {expandedAnalysisQuestion === item.goldenId && (
                          <tr>
                            <td colSpan={11} style={{ background: "var(--color-bg-subtle, #f9f9f9)", padding: 12, fontSize: 13 }}>
                              {item.issues.length > 0 && (
                                <div style={{ marginBottom: 8, padding: 6, background: "#fff3e0", borderRadius: 4, border: "1px solid #ffcc02", fontSize: 12, color: "#e65100" }}>
                                  ⚠️ {item.issues.join("；")}
                                </div>
                              )}
                              {/* Golden Set */}
                              <div style={{ marginBottom: 12 }}>
                                <strong>📖 Golden Set 期望答案：</strong>
                                <div style={{ margin: "4px 0", padding: 8, background: "#fff", borderRadius: 4, border: "1px solid #e0e0e0", whiteSpace: "pre-wrap", maxHeight: 400, overflow: "auto" }}>
                                  {item.goldenSays || "(无)"}
                                </div>
                                {item.mustIncludeFacts && item.mustIncludeFacts.length > 0 && (
                                  <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
                                    <strong>必须包含的事实：</strong>
                                    <ul style={{ margin: "2px 0", paddingLeft: 18 }}>
                                      {item.mustIncludeFacts.map((f, fi) => <li key={fi}>{f}</li>)}
                                    </ul>
                                  </div>
                                )}
                                <div style={{ marginTop: 4, fontSize: 12 }}>
                                  <strong>期望来源：</strong> {item.expectedSources.length > 0 ? item.expectedSources.join(", ") : "(无)"}
                                </div>
                              </div>

                              {/* Actual Answer & Citations */}
                              <div style={{ marginBottom: 12 }}>
                                <strong>📝 Actual Answer：</strong>
                                <div style={{ margin: "4px 0", padding: 8, background: "#e3f2fd", borderRadius: 4, border: "1px solid #90caf9", whiteSpace: "pre-wrap", maxHeight: 500, overflow: "auto", fontSize: 13 }}>
                                  {item.actualAnswer || "(空)"}
                                </div>
                              </div>
                              <div style={{ marginBottom: 8 }}>
                                <strong>📚 Actual Citations ({item.actualSources.length})：</strong>
                                {item.actualSources.length > 0 ? (
                                  <div style={{ margin: "4px 0", display: "flex", flexDirection: "column", gap: 4 }}>
                                    {item.actualSources.map((s, si) => {
                                      // 兼容旧格式 (string[]) 和新格式 (SourceCitation[])
                                      const title = typeof s === "string" ? s : s.title;
                                      const url = typeof s === "string" ? undefined : s.url;
                                      const type = typeof s === "string" ? "knowledge" : s.type;
                                      return (
                                        <div key={si} style={{ fontSize: 12, display: "flex", alignItems: "flex-start", gap: 4 }}>
                                          <span style={{ color: "#1565c0", fontWeight: 600, minWidth: 24 }}>[{si + 1}]</span>
                                          {url ? (
                                            <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#1976d2", textDecoration: "underline" }}>{title}</a>
                                          ) : (
                                            <span>{title}</span>
                                          )}
                                          <span style={{ fontSize: 10, color: type === "web" ? "#4caf50" : "#9c27b0", marginLeft: 4 }}>
                                            {type === "web" ? "🌐 web" : "📁 kb"}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : <span style={{ fontSize: 12, color: "#999" }}> (无)</span>}
                              </div>
                              {item.metricDiagnosis && (
                                <div style={{ marginTop: 8 }}>
                                  <strong>⚠️ 低分原因诊断：</strong>
                                  <div style={{ margin: "4px 0", padding: 8, background: "#fff3e0", borderRadius: 4, border: "1px solid #ffcc02", whiteSpace: "pre-wrap", fontSize: 12, color: "#e65100" }}>
                                    {item.metricDiagnosis}
                                  </div>
                                </div>
                              )}
                              <div style={{ marginTop: 8, fontSize: 11, color: "#999" }}>
                                <details>
                                  <summary style={{ cursor: "pointer" }}>Metric 指标定义</summary>
                                  <div style={{ margin: "4px 0", padding: 8, background: "#f5f5f5", borderRadius: 4, whiteSpace: "pre-wrap" }}>
                                    {item.metricDefs}
                                  </div>
                                </details>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 维度聚合表 */}
          {(["byCategory", "bySourceType", "byDifficulty"] as const).map(dim => {
            const dimLabels = { byCategory: "按分类", bySourceType: "按来源类型", byDifficulty: "按难度" };
            const rows = analysisData.breakdowns[dim];
            if (!rows || rows.length === 0) return null;
            return (
              <div key={dim} style={{ marginBottom: 16 }}>
                <h5>{dimLabels[dim]}</h5>
                <div className="metrics-table-wrap">
                  <table className="metrics-table">
                    <thead>
                      <tr>
                        <th>维度</th>
                        <th>评估用例数</th>
                        <th>Recall</th>
                        <th>NDCG</th>
                        <th>Faithfulness</th>
                        <th>答案正确</th>
                        <th>事实覆盖</th>
                        <th>路由准确</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(row => (
                        <tr key={row.dimension}>
                          <td>{row.dimension}</td>
                          <td>{row.count}</td>
                          <td>{row.avgRecall.toFixed(3)}</td>
                          <td>{row.avgNdcg.toFixed(3)}</td>
                          <td>{row.avgFaithfulness.toFixed(3)}</td>
                          <td>{row.avgAnswerCorrectness.toFixed(3)}</td>
                          <td>{row.avgFactCoverage.toFixed(3)}</td>
                          <td>{row.avgSourceRoutingAccuracy.toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────

/** 指标 key → 中文标签 */
function metricLabel(key: string): string {
  const labels: Record<string, string> = {
    avgRecall: "Recall",
    avgNdcg: "NDCG",
    avgFaithfulness: "Faithfulness",
    avgDurationMs: "耗时",
    passRate: "通过率",
    avgAnswerCorrectness: "答案正确",
    avgFactCoverage: "事实覆盖",
    avgSourceRoutingAccuracy: "路由准确",
    avgKbHitRate: "KB Hit",
  };
  return labels[key] ?? key;
}

/** 格式化指标值 */
function formatMetricValue(key: string, value: number): string {
  if (key === "avgDurationMs") return `${(value / 1000).toFixed(1)}s`;
  if (key === "passRate") return `${(value * 100).toFixed(0)}%`;
  return value.toFixed(3);
}

/** 格式化时间为本地时间字符串 */
function formatLocalTime(ts: string): string {
  // 如果没有时区后缀（如 "2026-06-19 15:08:16"），视为本地时间直接解析
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}$/.test(ts)) {
    const parts = ts.split(/[T ]/);
    const datePart = parts[0] ?? "";
    const timePart = parts[1] ?? "";
    const [y, m, d] = datePart.split("-").map(Number);
    const [h, min, s] = timePart.split(":").map(Number);
    return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1, h ?? 0, min ?? 0, s ?? 0).toLocaleString();
  }
  // 有时区后缀的直接解析
  return new Date(ts).toLocaleString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m${rem}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h${remM}m`;
}
