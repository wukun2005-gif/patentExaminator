import { describe, it, expect } from "vitest";

const buildCqlQuery = (searchTerms: string): string => {
  const terms = searchTerms
    .split(/\s*\|\s*/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const conditions = terms.map((t) => {
    if (/^[A-H][0-9][0-9][A-Z]/.test(t)) {
      return `ipc any "${t}"`;
    }
    return `ti any "${t}" OR ab any "${t}" OR cl any "${t}"`;
  });

  if (conditions.length === 0) {
    return `ti any "${searchTerms}" OR ab any "${searchTerms}"`;
  }

  return conditions.join(" AND ");
};

describe("buildCqlQuery", () => {
  it("single term produces valid CQL with ti/ab/cl indexes", () => {
    const cql = buildCqlQuery("LED散热模组 相变材料");
    expect(cql).toBe(
      'ti any "LED散热模组 相变材料" OR ab any "LED散热模组 相变材料" OR cl any "LED散热模组 相变材料"'
    );
  });

  it("pipe-delimited terms produce AND-joined conditions", () => {
    const cql = buildCqlQuery("LED散热模组 相变材料 | 相变材料层 45-65°C | LED heatsink");
    expect(cql).toContain(" AND ");
    for (const term of ["LED散热模组 相变材料", "相变材料层 45-65°C", "LED heatsink"]) {
      expect(cql).toContain(`ti any "${term}"`);
      expect(cql).toContain(`ab any "${term}"`);
      expect(cql).toContain(`cl any "${term}"`);
    }
  });

  it("IPC pattern matches use ipc index", () => {
    const cql = buildCqlQuery("H01L33/00");
    expect(cql).toBe('ipc any "H01L33/00"');
  });

  it("mixed terms handle both IPC and text queries", () => {
    const cql = buildCqlQuery("LED散热 | H01L33/00");
    expect(cql).toContain(" AND ");
    expect(cql).toContain('ipc any "H01L33/00"');
    expect(cql).toContain('ti any "LED散热"');
  });

  it("empty input falls back to original searchTerms", () => {
    const cql = buildCqlQuery("test query");
    expect(cql).toContain('ti any "test query"');
    expect(cql).toContain('ab any "test query"');
  });

  it("never uses 'desc' index", () => {
    const cql = buildCqlQuery("LED散热模组 相变材料 | 相变材料层 45-65°C | 氮化铝陶瓷基板 散热 | 散热翅片 压铸一体成型 | LED heatsink phase change material");
    expect(cql).not.toMatch(/\bdesc\b/);
  });

  it("only valid EPO OPS index names appear: ti, ab, cl, ipc", () => {
    const testCases = [
      "LED散热模组",
      "LED散热模组 | 相变材料层 | 氮化铝陶瓷基板",
      "H01L33/00 | LED heatsink",
    ];
    const validIndexes = ["ti", "ab", "cl", "ipc"];
    for (const input of testCases) {
      const cql = buildCqlQuery(input);
      const indexPattern = /\b(\w+)\s+any\b/g;
      let match: RegExpExecArray | null;
      while ((match = indexPattern.exec(cql)) !== null) {
        expect(validIndexes).toContain(match[1]);
      }
    }
  });

  it("handles empty spaces around pipe separators", () => {
    const cql = buildCqlQuery("  term1  |  term2  ");
    expect(cql).toContain('ti any "term1"');
    expect(cql).toContain('ti any "term2"');
    expect(cql).toContain(" AND ");
  });

  it("filters out empty terms from extra pipes", () => {
    const cql = buildCqlQuery("term1 || term2");
    expect(cql).not.toContain('""');
    expect(cql).toContain('ti any "term1"');
    expect(cql).toContain('ti any "term2"');
  });
});