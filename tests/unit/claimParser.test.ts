import { describe, it, expect } from "vitest";
import { parseClaims } from "@client/lib/claimParser";

describe("parseClaims", () => {
  const caseId = "test-case";

  it("T-CLAIM-001: standard independent claim", () => {
    const text = `权利要求书
1. 一种LED散热装置，包括基板和散热翅片。
2. 根据权利要求1所述的LED散热装置，其特征在于，所述基板为铝合金材质。`;
    const result = parseClaims(text, caseId);
    expect(result.claims).toHaveLength(2);
    expect(result.claims[0]!.type).toBe("independent");
    expect(result.claims[0]!.claimNumber).toBe(1);
  });

  it("T-CLAIM-002: dependent claim with dependency chain", () => {
    const text = `权利要求书
1. 一种传感器装置，包括传感元件和信号处理模块。
2. 根据权利要求1所述的传感器装置，其特征在于，所述传感元件为温度传感器。
3. 根据权利要求2所述的传感器装置，其特征在于，还包括报警模块。`;
    const result = parseClaims(text, caseId);
    expect(result.claims).toHaveLength(3);
    expect(result.claims[1]!.type).toBe("dependent");
    expect(result.claims[1]!.dependsOn).toEqual([1]);
    expect(result.claims[2]!.type).toBe("dependent");
    expect(result.claims[2]!.dependsOn).toEqual([2]);
  });

  it("T-CLAIM-003: multiple independent claims", () => {
    const text = `权利要求书
1. 一种装置A，包括X和Y。
2. 根据权利要求1所述的装置A，其特征在于，所述X为金属。
3. 根据权利要求1所述的装置A，其特征在于，所述Y为塑料。
4. 一种装置B，包括Z。
5. 根据权利要求4所述的装置B，其特征在于，所述Z为复合材料。
6. 根据权利要求4所述的装置B，其特征在于，还包括W。
7. 根据权利要求6所述的装置B，其特征在于，所述W为弹性体。
8. 一种系统，包括如权利要求1所述的装置A和如权利要求4所述的装置B。
9. 根据权利要求8所述的系统，其特征在于，还包括控制单元。
10. 根据权利要求9所述的系统，其特征在于，所述控制单元为PLC。`;
    const result = parseClaims(text, caseId);
    const independents = result.claims.filter((c) => c.type === "independent");
    // Claim 8 references claims 1 and 4, so it's classified as dependent per DESIGN §8.4.3
    expect(independents.map((c) => c.claimNumber).sort()).toEqual([1, 4]);
  });

  it("T-CLAIM-004: target claim filtering", () => {
    const text = `权利要求书
1. 一种装置，包括A和B。
2. 根据权利要求1所述的装置，其特征在于，所述A为金属。
3. 根据权利要求2所述的装置，其特征在于，所述金属为铝。`;
    const result = parseClaims(text, caseId);
    // Claims 1, 2, 3 form a dependency chain from claim 1
    expect(result.claims[0]!.dependsOn).toEqual([]);
    expect(result.claims[1]!.dependsOn).toEqual([1]);
    expect(result.claims[2]!.dependsOn).toEqual([2]);
  });

  it("T-CLAIM-005: functional language detection", () => {
    const text = `权利要求书
1. 一种装置，包括用于散热的构件和用于固定的部件。`;
    const result = parseClaims(text, caseId);
    expect(result.claims).toHaveLength(1);
    // The claim text contains "用于...的" which is functional language
    expect(result.claims[0]!.rawText).toContain("用于");
  });

  it("handles no claim region", () => {
    const result = parseClaims("这是一段普通文本，没有权利要求。", caseId);
    expect(result.claims).toHaveLength(0);
    expect(result.warnings).toContain("no-claim-region");
  });

  it("validates dependency ranges", () => {
    const text = `权利要求书
1. 一种装置，包括A。
2. 根据权利要求3所述的装置，其特征在于，所述A为金属。`;
    const result = parseClaims(text, caseId);
    expect(result.warnings.some((w) => w.includes("invalid-dependency"))).toBe(true);
  });

  it("handles Chinese period variants", () => {
    const text = `权利要求书
1．一种装置，包括A和B。
2．根据权利要求1所述的装置，其特征在于，所述A为金属。`;
    const result = parseClaims(text, caseId);
    expect(result.claims).toHaveLength(2);
  });
});
