import { useState, useEffect, useRef } from "react";
import { useDefectsStore, useCaseStore } from "../../store";
import type { DefectRequest, DefectResponse } from "@shared/types/api";
import type { FormalDefect } from "@shared/types/domain";
import { InlineEdit } from "../../components/InlineEdit";
import { ConfirmModal } from "../../components/ConfirmModal";
import { ErrorBanner } from "../../lib/errorDisplay";
import { createLogger } from "../../lib/logger";

const log = createLogger("DefectPanel");

interface DefectPanelProps {
  caseId: string;
  claimText: string;
  specificationText: string;
  claimFeatures: Array<{ featureCode: string; description: string }>;
  runDefectCheck: (request: DefectRequest, options?: { signal?: AbortSignal }) => Promise<DefectResponse>;
}

const SEVERITY_LABELS: Record<string, string> = {
  error: "严重",
  warning: "警告",
  info: "提示"
};

const OVERCOME_LABELS: Record<string, string> = {
  overcome: "已克服",
  "not-overcome": "未克服",
  "partially-overcome": "部分克服"
};

export function DefectPanel({
  caseId,
  claimText,
  specificationText,
  claimFeatures,
  runDefectCheck
}: DefectPanelProps) {
  const { defects, addDefect, updateDefect, removeDefect, isLoading, setLoading, ranCases, addRanCase } =
    useDefectsStore();
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const controllers = abortControllersRef.current;
    return () => {
      isMountedRef.current = false;
      controllers.forEach((controller, key) => {
        controller.abort();
        log(`[DefectPanel] Aborted request ${key} on unmount`);
      });
      controllers.clear();
    };
  }, []);

  const caseDefects = defects.filter((d) => d.caseId === caseId);
  const unresolvedCount = caseDefects.filter((d) => !d.resolved).length;

  const handleRun = async () => {
    if (isLoading) return;
    if (caseDefects.length > 0 && !showConfirm) {
      setShowConfirm(true);
      return;
    }
    setShowConfirm(false);

    const existingController = abortControllersRef.current.get("defectCheck");
    if (existingController) existingController.abort();

    const controller = new AbortController();
    abortControllersRef.current.set("defectCheck", controller);

    setLoading(true);
    setError(null);
    try {
      const request: DefectRequest = {
        caseId,
        claimText,
        specificationText,
        claimFeatures
      };

      const response = await runDefectCheck(request, { signal: controller.signal });

      if (!isMountedRef.current || controller.signal.aborted) return;

      // === 缺陷保留策略 ===
      // 1. 用户手动添加的缺陷（ID 格式为 3 部分）：全部保留
      // 2. 用户编辑过的 AI 缺陷（ID 格式为 4 部分）：保留 编辑过的字段
      // 
      // 判断"已编辑"的标准：
      // - severity 被修改（通过比较原始 AI 返回值）
      // - description 被修改（通过比较原始 AI 返回值）
      // - location 被添加或修改
      // - resolved 状态被修改（从未解决变为已解决）
      //
      // 对于编辑过的 AI 缺陷，将用户编辑的字段 merge 到新返回的匹配缺陷上

      // 用户添加的缺陷 ID 格式: defect-{caseId}-{timestamp} (无随机后缀)
      // AI 生成的缺陷 ID 格式: defect-{caseId}-{timestamp}-{random} (有随机后缀，4部分)
      // 
      // 注意：由于 caseId 可能包含 - 字符（如 preset-demo-001），不能用 parts.length 判断
      // 改用正则表达式判断：AI 生成的 ID 末尾有 4 字符随机后缀
      // 
      // 判断规则：
      // - AI 生成：ID 末尾是 -xxxx 格式（4 字符十六进制随机后缀）
      // - 用户添加：ID 末尾是时间戳（纯数字）

      // 添加详细的 ID 诊断日志
      log("[DefectPanel] All defect IDs before classification:");
      for (const d of caseDefects) {
        log(`  - ${d.id} | description: "${d.description.slice(0, 20)}..."`);
      }

      // AI 生成的缺陷 ID 末尾有 4 字符随机后缀（[a-z0-9]{4}）
      // 用户添加的缺陷 ID 末尾是时间戳（纯数字）
      const aiGeneratedPattern = /-[a-z0-9]{4}$/;  // 匹配末尾的 -xxxx
      
      const userAddedDefects = caseDefects.filter((d) => {
        const isUserAdded = !aiGeneratedPattern.test(d.id);
        log(`[DefectPanel] Classifying defect "${d.id.slice(-15)}": ${isUserAdded ? 'USER_ADDED' : 'AI_GENERATED'}`);
        return isUserAdded;
      });

      // AI 生成的缺陷
      const aiGeneratedDefects = caseDefects.filter((d) => {
        return aiGeneratedPattern.test(d.id);
      });

      log("[DefectPanel] handleRun - defect preservation:", {
        total: caseDefects.length,
        userAdded: userAddedDefects.length,
        aiGenerated: aiGeneratedDefects.length,
        aiResponseCount: response.defects.length
      });

      addRanCase(caseId);
      useCaseStore.getState().updateWorkflowState("defects-ready");

      // 清除所有旧缺陷
      const oldIds = caseDefects.map((d) => d.id);
      for (const id of oldIds) {
        useDefectsStore.getState().removeDefect(id);
      }

      // 添加 AI 新返回的缺陷
      for (const item of response.defects) {
        const defect: FormalDefect = {
          id: `defect-${caseId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          caseId,
          category: item.category,
          description: item.description,
          severity: item.severity,
          resolved: false,
          ...(item.location ? { location: item.location } : {}),
          ...(item.previouslyRaised !== undefined ? { previouslyRaised: item.previouslyRaised } : {}),
          ...(item.overcomeStatus ? { overcomeStatus: item.overcomeStatus } : {})
        };
        
        addDefect(defect);
      }

      // 重新添加用户手动添加的缺陷（保留用户的手动编辑）
      for (const userDefect of userAddedDefects) {
        log("[DefectPanel] restoring user-added defect:", userDefect.id);
        addDefect(userDefect);
      }
    } catch (err) {
      log("[DefectPanel] Error running defect check:", err);
      if (isMountedRef.current) {
        setError(err);
      }
    } finally {
      abortControllersRef.current.delete("defectCheck");
      if (isMountedRef.current) setLoading(false);
    }
  };

  const handleToggleResolved = (defect: FormalDefect) => {
    updateDefect({ ...defect, resolved: !defect.resolved });
  };

  const handleDeleteDefect = (id: string) => {
    removeDefect(id);
  };

  const handleAddDefect = (category: string) => {
    const newDefect: FormalDefect = {
      id: `defect-${caseId}-${Date.now()}`,
      caseId,
      category,
      description: "",
      severity: "warning",
      resolved: false
    };
    addDefect(newDefect);
  };

  // Group defects by category
  const grouped = new Map<string, FormalDefect[]>();
  for (const d of caseDefects) {
    const list = grouped.get(d.category) ?? [];
    list.push(d);
    grouped.set(d.category, list);
  }

  return (
    <div className="defect-panel" data-testid="defect-panel">
      <h2>缺陷复查</h2>

      {error != null && <ErrorBanner error={error} data-testid="defect-error" />}

      {caseDefects.length > 0 && (
        <div className="defect-legal-caution" data-testid="defect-legal-caution">
          以下为 AI 辅助检测结果，需审查员逐项确认。
        </div>
      )}

      {caseDefects.length > 0 ? (
        <div className="defect-result">
          <div className="defect-summary" data-testid="defect-summary">
            共 {caseDefects.length} 项缺陷，其中 {unresolvedCount} 项未解决
          </div>

          {[...grouped.entries()].map(([category, items]) => (
            <div key={category} className="defect-category-group">
              <h3 className="defect-category-title">{category}</h3>
              <table className="defect-table" data-testid="defect-table">
                <thead>
                  <tr>
                    <th className="defect-col-severity">严重度</th>
                    <th className="defect-col-desc">缺陷描述</th>
                    <th className="defect-col-location">位置</th>
                    <th>上次已指出</th>
                    <th>克服状态</th>
                    <th className="defect-col-status">状态</th>
                    <th className="defect-col-actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((d) => (
                    <tr
                      key={d.id}
                      className={d.resolved ? "defect-row--resolved" : ""}
                      data-testid={`defect-row-${d.id}`}
                    >
                      <td>
                        <InlineEdit
                          as="select"
                          value={d.severity}
                          options={Object.entries(SEVERITY_LABELS).map(([value, label]) => ({ value, label }))}
                          onSave={(v) => updateDefect({ ...d, severity: v as FormalDefect["severity"] })}
                        >
                          <span
                            className={`severity-badge severity-${d.severity}`}
                            data-testid={`severity-${d.id}`}
                          >
                            {SEVERITY_LABELS[d.severity]}
                          </span>
                        </InlineEdit>
                      </td>
                      <td className="defect-desc">
                        <InlineEdit
                          as="textarea"
                          value={d.description}
                          rows={2}
                          onSave={(v) => updateDefect({ ...d, description: v })}
                        >
                          <span>{d.description}</span>
                        </InlineEdit>
                      </td>
                      <td className="defect-location">
                        <InlineEdit
                          value={d.location ?? ""}
                          placeholder="无"
                          onSave={(v) => {
                            const patch: Partial<FormalDefect> = v ? { location: v } : {};
                            if (!v) delete patch.location;
                            updateDefect({ ...d, ...patch });
                          }}
                        >
                          <span>{d.location || "—"}</span>
                        </InlineEdit>
                      </td>
                      <td>{d.previouslyRaised ? "是" : "否"}</td>
                      <td>{d.overcomeStatus ? OVERCOME_LABELS[d.overcomeStatus] : "—"}</td>
                      <td>
                        <label className="defect-resolve-toggle">
                          <input
                            type="checkbox"
                            checked={d.resolved}
                            onChange={() => handleToggleResolved(d)}
                            data-testid={`resolve-${d.id}`}
                          />
                          {d.resolved ? "已解决" : "未解决"}
                        </label>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-delete-icon"
                          onClick={() => handleDeleteDefect(d.id)}
                          data-testid={`delete-defect-${d.id}`}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                className="btn-add-item"
                onClick={() => handleAddDefect(category)}
                data-testid="add-defect"
                style={{ marginTop: 8 }}
              >
                + 添加缺陷
              </button>
            </div>
          ))}
        </div>
      ) : ranCases.includes(caseId) ? (
        <div className="defect-empty" data-testid="defect-empty">
          <p>未发现形式缺陷。</p>
          <p className="defect-empty-hint">AI 已对权利要求和说明书完成形式缺陷检测，未发现问题。</p>
        </div>
      ) : (
        <div className="defect-empty" data-testid="defect-empty">
          <p>尚未运行缺陷复查。</p>
          <p className="defect-empty-hint">点击下方按钮，AI 将自动检测本轮修改是否克服上次指出的形式缺陷。</p>
        </div>
      )}

      <button
        type="button"
        onClick={handleRun}
        disabled={isLoading}
        data-testid="btn-run-defect-check"
      >
        {isLoading ? "检测中..." : caseDefects.length > 0 ? "重新运行复查" : "运行缺陷复查"}
      </button>

      <ConfirmModal
        isOpen={showConfirm}
        title="确认重新运行复查"
        confirmLabel="确认重新运行"
        cancelLabel="取消"
        onConfirm={handleRun}
        onCancel={() => setShowConfirm(false)}
      >
        重新运行将用 AI 新检测结果替换所有缺陷。您手动添加的缺陷将被保留。确定要继续吗？
      </ConfirmModal>
    </div>
  );
}
