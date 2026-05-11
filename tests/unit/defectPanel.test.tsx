import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DefectPanel } from "@client/features/defects/DefectPanel";
import { useDefectsStore } from "@client/store";
import type { FormalDefect } from "@shared/types/domain";
import type { DefectRequest, DefectResponse } from "@client/agent/contracts";

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

describe("DefectPanel - 形式缺陷检查", () => {
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
    expect(screen.getByText("尚未运行形式缺陷检查。")).toBeTruthy();
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
});
