import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { PatentCase } from "@shared/types/domain";
import { readAllCases, deleteCase } from "../../lib/repos";
import { loadCaseById } from "../../lib/caseLoader";
import { useCaseStore } from "../../store";
import { createLogger } from "../../lib/logger";

const log = createLogger("CaseHistoryPanel");

export function CaseHistoryPanel() {
  const { cases, setCases } = useCaseStore();
  const navigate = useNavigate();
  const [searchId, setSearchId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const controllers = abortControllersRef.current;
    return () => {
      isMountedRef.current = false;
      controllers.forEach((controller) => {
        controller.abort();
      });
      controllers.clear();
    };
  }, []);

  // Load all cases from IndexedDB on mount
  useEffect(() => {
    (async () => {
      try {
        const all = await readAllCases();
        setCases(all);
      } catch { /* IndexedDB unavailable */ }
    })();
  }, [setCases]);

  const handleOpenCase = async (caseId: string) => {
    const controller = new AbortController();
    abortControllersRef.current.set("openCase", controller);
    setLoading(true);
    setError("");
    try {
      const loaded = await loadCaseById(caseId);
      if (!isMountedRef.current) return;
      if (loaded) {
        navigate(`/cases/${caseId}/setup`);
      } else {
        setError(`案件 ${caseId} 不存在。`);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      log("加载案件失败:", err);
      setError(`加载案件失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (isMountedRef.current) setLoading(false);
      abortControllersRef.current.delete("openCase");
    }
  };

  const handleSearch = async () => {
    const id = searchId.trim();
    if (!id) return;
    await handleOpenCase(id);
  };

  const handleDelete = async (caseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("确定删除该案件？删除后不可恢复。")) return;
    const controller = new AbortController();
    abortControllersRef.current.set("delete", controller);
    try {
      await deleteCase(caseId);
      if (!isMountedRef.current) return;
      setCases(cases.filter((c) => c.id !== caseId));
    } finally {
      abortControllersRef.current.delete("delete");
    }
  };

  return (
    <div className="case-history-panel" data-testid="case-history-panel">
      <h2>案件历史</h2>

      {/* Search by case ID */}
      <div className="case-search-bar">
        <input
          type="text"
          placeholder="输入案件 ID 搜索（如 case-1700000000000）"
          value={searchId}
          onChange={(e) => setSearchId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          data-testid="input-case-search"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading || !searchId.trim()}
          data-testid="btn-search-case"
        >
          {loading ? "加载中..." : "搜索"}
        </button>
      </div>

      {error && (
        <p className="case-search-error" data-testid="case-search-error">{error}</p>
      )}

      {/* Case list */}
      {cases.length === 0 ? (
        <p data-testid="no-cases">暂无案件记录。请先创建新案件。</p>
      ) : (
        <div className="case-list" data-testid="case-list">
          {cases.map((c) => (
            <CaseListItem
              key={c.id}
              caseData={c}
              onOpen={handleOpenCase}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CaseListItem({
  caseData,
  onOpen,
  onDelete
}: {
  caseData: PatentCase;
  onOpen: (id: string) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="case-list-item"
      data-testid={`case-item-${caseData.id}`}
      onClick={() => onOpen(caseData.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(caseData.id);
      }}
    >
      <div className="case-item-main">
        <div className="case-title">{caseData.title || "（未命名案件）"}</div>
        <div className="case-meta">
          <span className="case-id" title={caseData.id}>{caseData.id}</span>
          {caseData.applicationNumber && (
            <span className="app-number">{caseData.applicationNumber}</span>
          )}
          {caseData.applicationDate && (
            <span className="app-date">{caseData.applicationDate}</span>
          )}
          <span className={`workflow-state ${caseData.workflowState}`}>
            {WORKFLOW_LABELS[caseData.workflowState] ?? caseData.workflowState}
          </span>
        </div>
        {caseData.updatedAt && (
          <div className="case-updated">最后更新: {formatDate(caseData.updatedAt)}</div>
        )}
      </div>
      <button
        type="button"
        className="btn-delete-case"
        onClick={(e) => onDelete(caseData.id, e)}
        data-testid={`btn-delete-${caseData.id}`}
        title="删除案件"
      >
        删除
      </button>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}

// B-032: 重写 WORKFLOW_LABELS，覆盖 CaseWorkflowState 的全部 19 个状态
const WORKFLOW_LABELS: Record<string, string> = {
  empty: "空白",
  "case-ready": "案件就绪",
  "documents-uploaded": "文档已上传",
  "text-extracted": "文本已提取",
  "ocr-running": "OCR 识别中",
  "ocr-failed": "OCR 失败",
  "ocr-review": "OCR 待审核",
  "text-confirmed": "文本已确认",
  "opinion-analyzed": "意见已分析",
  "argument-mapped": "论点已映射",
  "references-ready": "文献就绪",
  "timeline-checked": "时间轴已校验",
  "claim-chart-ready": "Claim Chart 就绪",
  "claim-chart-reviewed": "Claim Chart 已审核",
  "novelty-ready": "新颖性就绪",
  "inventive-ready": "创造性就绪",
  "defects-ready": "缺陷就绪",
  "draft-ready": "草稿就绪",
  "export-ready": "导出就绪"
};
