import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DefectPanel } from "@client/features/defects/DefectPanel";
import { useDefectsStore } from "@client/store";
import type { FormalDefect } from "@shared/types/domain";
import type { DefectRequest, DefectResponse } from "@shared/types/api";

function makeDefect(overrides: Partial<FormalDefect> = {}): FormalDefect {
  return {
    id: "defect-test-1",
    caseId: "test",
    category: "权利要求",
    description: "权利要求引用关系不明确",
    location: "权利要求2",
    severity: "error",
    resolved: false,
    ...overrides
  };
}

const NOOP_RUN = async (_req: DefectRequest): Promise<DefectResponse> => ({
  defects: [],
  warnings: [],
  legalCaution: ""
});

describe("DefectPanel - 缺陷复查", () => {
  beforeEach(() => {
    useDefectsStore.getState().setDefects([]);
  });

  it("store 为空时显示占位提示", () => {
    render(
      <DefectPanel
        caseId="test"
        claimText=""
        specificationText=""
        claimFeatures={[]}
        runDefectCheck={NOOP_RUN}
      />
    );

    expect(screen.getByTestId("defect-empty")).toBeTruthy();
    expect(screen.getByText("尚未运行缺陷复查。")).toBeTruthy();
  });

  it("store 中已有 defects 时，表格正确渲染", () => {
    const defect = makeDefect();
    useDefectsStore.getState().setDefects([defect]);

    render(
      <DefectPanel
        caseId="test"
        claimText=""
        specificationText=""
        claimFeatures={[]}
        runDefectCheck={NOOP_RUN}
      />
    );

    expect(screen.getByTestId("defect-table")).toBeTruthy();
    expect(screen.getByText("权利要求引用关系不明确")).toBeTruthy();
    expect(screen.getByText("权利要求2")).toBeTruthy();
  });

  it("严重度标签正确显示", () => {
    useDefectsStore.getState().setDefects([
      makeDefect({ id: "d1", severity: "error" }),
      makeDefect({ id: "d2", severity: "warning", category: "说明书" }),
      makeDefect({ id: "d3", severity: "info", category: "附图" })
    ]);

    render(
      <DefectPanel
        caseId="test"
        claimText=""
        specificationText=""
        claimFeatures={[]}
        runDefectCheck={NOOP_RUN}
      />
    );

    expect(screen.getByTestId("severity-d1").textContent).toBe("严重");
    expect(screen.getByTestId("severity-d2").textContent).toBe("警告");
    expect(screen.getByTestId("severity-d3").textContent).toBe("提示");
  });

  it("点击已解决切换 resolved 状态", () => {
    const defect = makeDefect();
    useDefectsStore.getState().setDefects([defect]);

    render(
      <DefectPanel
        caseId="test"
        claimText=""
        specificationText=""
        claimFeatures={[]}
        runDefectCheck={NOOP_RUN}
      />
    );

    const checkbox = screen.getByTestId(`resolve-${defect.id}`) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);

    const updated = useDefectsStore.getState().defects.find((d) => d.id === defect.id);
    expect(updated?.resolved).toBe(true);
  });

  it("运行分析后 defects 写入 store", async () => {
    const runDefectCheck = async (): Promise<DefectResponse> => ({
      defects: [
        { category: "权利要求", description: "缺少引用关系", severity: "error" },
        { category: "说明书", description: "实施例不足", location: "第3段", severity: "warning" }
      ],
      warnings: [],
      legalCaution: "测试法律提示"
    });

    render(
      <DefectPanel
        caseId="test"
        claimText="一种装置"
        specificationText="本发明涉及..."
        claimFeatures={[{ featureCode: "A", description: "基板" }]}
        runDefectCheck={runDefectCheck}
      />
    );

    fireEvent.click(screen.getByTestId("btn-run-defect-check"));

    // Wait for async operation — multiple tables when grouped by category
    await screen.findAllByTestId("defect-table");

    const storeDefects = useDefectsStore.getState().defects.filter((d) => d.caseId === "test");
    expect(storeDefects.length).toBe(2);
    expect(storeDefects[0]!.category).toBe("权利要求");
    expect(storeDefects[1]!.severity).toBe("warning");
  });

  it("显示法律提示横幅", () => {
    useDefectsStore.getState().setDefects([makeDefect()]);

    render(
      <DefectPanel
        caseId="test"
        claimText=""
        specificationText=""
        claimFeatures={[]}
        runDefectCheck={NOOP_RUN}
      />
    );

    expect(screen.getByTestId("defect-legal-caution")).toBeTruthy();
  });

  it("显示未解决数量统计", () => {
    useDefectsStore.getState().setDefects([
      makeDefect({ id: "d1", resolved: false }),
      makeDefect({ id: "d2", resolved: true, category: "说明书" }),
      makeDefect({ id: "d3", resolved: false, category: "附图" })
    ]);

    render(
      <DefectPanel
        caseId="test"
        claimText=""
        specificationText=""
        claimFeatures={[]}
        runDefectCheck={NOOP_RUN}
      />
    );

    expect(screen.getByText(/共 3 项缺陷/)).toBeTruthy();
    expect(screen.getByText(/2 项未解决/)).toBeTruthy();
  });

  it("bug22: 重新运行复查时保留用户手动添加的缺陷", async () => {
    // 场景：用户手动添加了一个缺陷（ID 格式: defect-{caseId}-{timestamp}，3部分）
    // 然后点击重新运行复查，AI 返回新的缺陷列表
    // 预期：用户手动添加的缺陷应该被保留

    const caseId = "test";
    const userAddedDefectId = `defect-${caseId}-1234567890`; // 3 部分 ID，用户添加的
    const aiGeneratedDefectId = `defect-${caseId}-1234567890-abc1`; // 4 部分 ID，AI 生成的

    // 初始状态：一个 AI 生成的缺陷 + 一个用户添加的缺陷
    useDefectsStore.getState().setDefects([
      makeDefect({
        id: aiGeneratedDefectId,
        caseId,
        description: "AI 发现的缺陷",
        category: "权利要求"
      }),
      makeDefect({
        id: userAddedDefectId,
        caseId,
        description: "用户手动添加的缺陷",
        category: "说明书",
        severity: "warning"
      })
    ]);

    // 模拟 AI 返回新的缺陷
    const runDefectCheck = async (): Promise<DefectResponse> => ({
      defects: [
        { category: "权利要求", description: "AI 新发现的缺陷", severity: "error" }
      ],
      warnings: [],
      legalCaution: ""
    });

    render(
      <DefectPanel
        caseId={caseId}
        claimText=""
        specificationText=""
        claimFeatures={[]}
        runDefectCheck={runDefectCheck}
      />
    );

    // 点击重新运行复查（第一次点击会弹出确认对话框）
    fireEvent.click(screen.getByTestId("btn-run-defect-check"));

    // 点击确认对话框的确认按钮
    const confirmBtn = screen.getByText("确认重新运行");
    fireEvent.click(confirmBtn);

    // 等待异步操作完成
    await screen.findAllByTestId("defect-table");

    // 验证：用户添加的缺陷应该被保留，AI 生成的缺陷应该被替换
    const storeDefects = useDefectsStore.getState().defects.filter(d => d.caseId === caseId);

    // 应该有 2 个缺陷：用户添加的 + AI 新返回的
    expect(storeDefects.length).toBe(2);

    // 用户添加的缺陷应该被保留
    const userDefect = storeDefects.find(d => d.id === userAddedDefectId);
    expect(userDefect).toBeDefined();
    expect(userDefect?.description).toBe("用户手动添加的缺陷");

    // AI 新返回的缺陷应该存在
    const newAiDefect = storeDefects.find(d => d.description === "AI 新发现的缺陷");
    expect(newAiDefect).toBeDefined();

    // 旧的 AI 缺陷应该被删除
    const oldAiDefect = storeDefects.find(d => d.id === aiGeneratedDefectId);
    expect(oldAiDefect).toBeUndefined();
  });
});

describe("DefectPanel overcome status switching (TC-11)", () => {
  beforeEach(() => {
    useDefectsStore.getState().setDefects([]);
  });

  it("defect 初始状态为未克服", () => {
    const defect = makeDefect({ overcomeStatus: undefined });
    useDefectsStore.getState().setDefects([defect]);
    expect(useDefectsStore.getState().defects[0]!.overcomeStatus).toBeUndefined();
  });

  it("updateDefect 可将 overcomeStatus 设为 overcome", () => {
    const defect = makeDefect();
    useDefectsStore.getState().setDefects([defect]);
    useDefectsStore.getState().updateDefect({ ...defect, overcomeStatus: "overcome" });
    expect(useDefectsStore.getState().defects[0]!.overcomeStatus).toBe("overcome");
  });

  it("updateDefect 可将 overcomeStatus 设为 not-overcome", () => {
    const defect = makeDefect({ overcomeStatus: "overcome" });
    useDefectsStore.getState().setDefects([defect]);
    useDefectsStore.getState().updateDefect({ ...defect, overcomeStatus: "not-overcome" });
    expect(useDefectsStore.getState().defects[0]!.overcomeStatus).toBe("not-overcome");
  });

  it("updateDefect 可将 overcomeStatus 设为 partially-overcome", () => {
    const defect = makeDefect();
    useDefectsStore.getState().setDefects([defect]);
    useDefectsStore.getState().updateDefect({ ...defect, overcomeStatus: "partially-overcome" });
    expect(useDefectsStore.getState().defects[0]!.overcomeStatus).toBe("partially-overcome");
  });

  it("overcomeStatus 三种状态可自由切换", () => {
    const defect = makeDefect();
    useDefectsStore.getState().setDefects([defect]);

    const states = ["overcome", "not-overcome", "partially-overcome"] as const;
    for (const status of states) {
      useDefectsStore.getState().updateDefect({ ...defect, overcomeStatus: status });
      expect(useDefectsStore.getState().defects[0]!.overcomeStatus).toBe(status);
    }
  });
});
