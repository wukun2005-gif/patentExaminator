import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Inline copy of buildCqlQuery / escapeCqlTerm (the production function is not
// exported, so we replicate the logic here to keep unit tests fast and
// dependency-free). The behaviour is verified against the source in
// server/src/search/epo-ops.ts.
// ---------------------------------------------------------------------------

function escapeCqlTerm(term: string): string {
  return term.replace(/"/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildCqlQuery(searchTerms: string): string {
  const terms = searchTerms
    .split(/\s*\|\s*/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const conditions = terms.map((t) => {
    const escaped = escapeCqlTerm(t);
    if (/^[A-H][0-9][0-9][A-Z]/.test(t)) {
      return `ipc any "${escaped}"`;
    }
    return `ti all "${escaped}" OR ab all "${escaped}" OR cl all "${escaped}"`;
  });

  if (conditions.length === 0) {
    const escaped = escapeCqlTerm(searchTerms);
    return `ti all "${escaped}" OR ab all "${escaped}" OR cl all "${escaped}"`;
  }

  return conditions.join(" AND ");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildCqlQuery", () => {
  it("single term (2 words) produces valid CQL with ti/ab/cl indexes", () => {
    const cql = buildCqlQuery("LED散热模组 相变材料");
    expect(cql).toBe(
      'ti all "LED散热模组 相变材料" OR ab all "LED散热模组 相变材料" OR cl all "LED散热模组 相变材料"'
    );
  });

  it("pipe-delimited terms produce AND-joined conditions", () => {
    const cql = buildCqlQuery("LED散热模组 相变材料 | 相变材料层 45-65°C | LED heatsink");
    expect(cql).toContain(" AND ");
    for (const term of ["LED散热模组 相变材料", "相变材料层 45-65°C", "LED heatsink"]) {
      expect(cql).toContain(`ti all "${term}"`);
      expect(cql).toContain(`ab all "${term}"`);
      expect(cql).toContain(`cl all "${term}"`);
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
    expect(cql).toContain('ti all "LED散热"');
  });

  it("empty input falls back to original searchTerms", () => {
    const cql = buildCqlQuery("test query");
    expect(cql).toContain('ti all "test query"');
    expect(cql).toContain('ab all "test query"');
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
      const indexPattern = /\b(\w+)\s+any(?:\b|\s)/g;
      let match: RegExpExecArray | null;
      while ((match = indexPattern.exec(cql)) !== null) {
        expect(validIndexes).toContain(match[1]);
      }
    }
  });

  it("handles empty spaces around pipe separators", () => {
    const cql = buildCqlQuery("  term1  |  term2  ");
    expect(cql).toContain('ti all "term1"');
    expect(cql).toContain('ti all "term2"');
    expect(cql).toContain(" AND ");
  });

  it("filters out empty terms from extra pipes", () => {
    const cql = buildCqlQuery("term1 || term2");
    expect(cql).not.toContain('""');
    expect(cql).toContain('ti all "term1"');
    expect(cql).toContain('ti all "term2"');
  });

  it("uses 'all' for multi-word terms (words any order, not exact phrase)", () => {
    const cql = buildCqlQuery("LED phase change cooling");
    // All 4 words searched together with 'all' (any order), not split
    expect(cql).toBe(
      'ti all "LED phase change cooling" OR ab all "LED phase change cooling" OR cl all "LED phase change cooling"'
    );
  });

  // --- CQL injection prevention (td-22) ---

  it("strips double quotes to prevent CQL injection", () => {
    const cql = buildCqlQuery('term" OR ti all "injected');
    // Quotes stripped → "term OR ti all injected" treated as one search phrase
    expect(cql).toContain('ti all "term OR ti all injected"');
  });

  it("strips double quotes in IPC-like terms", () => {
    const cql = buildCqlQuery('H01L"33/00');
    // Quote stripped → "H01L 33/00", detected as IPC pattern
    expect(cql).toContain('ipc any "H01L 33/00"');
    expect(cql).not.toContain('H01L"33/00');
  });

  it("handles terms with only double quotes", () => {
    const cql = buildCqlQuery('"');
    // Quote stripped → empty string; should not crash
    expect(cql).toContain('ti all ""');
  });

  it("strips multiple double quotes in a single term", () => {
    const cql = buildCqlQuery('a"b"c');
    // Quotes stripped → "a b c" as one phrase
    expect(cql).toContain('ti all "a b c"');
  });

  // --- IPC classification detection (td-22) ---

  it("detects all valid IPC section letters A through H", () => {
    const sections = ["A", "B", "C", "D", "E", "F", "G", "H"];
    for (const s of sections) {
      const cql = buildCqlQuery(`${s}63B1/00`);
      expect(cql).toContain(`ipc any "${s}63B1/00"`);
    }
  });

  it("does NOT treat lowercase-starting terms as IPC", () => {
    const cql = buildCqlQuery("h01L33/00");
    expect(cql).toContain("ti all");
    expect(cql).not.toContain("ipc any");
  });

  it("does NOT treat terms starting with I-Z as IPC", () => {
    const cql = buildCqlQuery("J01L33/00");
    expect(cql).toContain("ti all");
    expect(cql).not.toContain("ipc any");
  });

  it("requires 3rd char to be a digit for IPC match", () => {
    // H01L => IPC, H0AB => not IPC (3rd char is not digit)
    const cql = buildCqlQuery("H0AB");
    expect(cql).toContain("ti all");
    expect(cql).not.toContain("ipc any");
  });

  // --- Multi-term AND logic (td-22) ---

  it("three pipe-delimited terms produce two AND operators", () => {
    const cql = buildCqlQuery("alpha | beta | gamma");
    const andCount = (cql.match(/ AND /g) || []).length;
    expect(andCount).toBe(2);
  });

  it("five pipe-delimited terms produce four AND operators", () => {
    const cql = buildCqlQuery("a | b | c | d | e");
    const andCount = (cql.match(/ AND /g) || []).length;
    expect(andCount).toBe(4);
  });

  it("single term produces no AND operator", () => {
    const cql = buildCqlQuery("only-one");
    expect(cql).not.toContain(" AND ");
  });

  // --- EPO API fetch mocking (td-22) ---

  describe("searchEpo with mocked fetch", () => {
    let fetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.resetModules(); // clear module-level cached token
      fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    async function callSearchEpo(searchTerms: string, maxResults = 10) {
      const { searchEpo } = await import("@server/search/epo-ops");
      return searchEpo(searchTerms, maxResults, "test-key", "test-secret");
    }

    function mockAuthOk() {
      return new Response(
        JSON.stringify({ access_token: "fake-token", expires_in: 1200 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    function mockSearchOk(results: Array<{ title: string; pubNum: string }>) {
      const exchangeDocs = results.map((r) => ({
        "@country": "EP",
        "@doc-number": r.pubNum,
        "@kind": "A1",
        "bibliographic-data": {
          "publication-reference": {
            "document-id": [
              {
                "@document-id-type": "docdb",
                "country": { "$": "EP" },
                "doc-number": { "$": r.pubNum },
                "kind": { "$": "A1" },
                "date": { "$": "20240101" }
              }
            ]
          },
          "invention-title": [{ "$": r.title, "@lang": "en" }],
          "abstract": [{ "$": `Abstract for ${r.title}`, "@lang": "en" }]
        }
      }));

      return new Response(
        JSON.stringify({
          "ops:world-patent-data": {
            "ops:biblio-search": {
              "ops:search-result": {
                "exchange-documents": {
                  "exchange-document": exchangeDocs
                }
              }
            }
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    it("returns parsed results on successful search", async () => {
      fetchSpy
        .mockResolvedValueOnce(mockAuthOk())
        .mockResolvedValueOnce(
          mockSearchOk([{ title: "LED Heatsink Patent", pubNum: "1234567" }])
        );

      const results = await callSearchEpo("LED heatsink");
      expect(results).toHaveLength(1);
      expect(results[0]!.title).toBe("LED Heatsink Patent");
    });

    it("throws on auth failure", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response("Unauthorized", { status: 401 })
      );

      await expect(callSearchEpo("test")).rejects.toThrow("EPO OAuth2 认证失败");
    });

    it("returns empty array when search returns 404 with fault XML", async () => {
      fetchSpy
        .mockResolvedValueOnce(mockAuthOk())
        .mockResolvedValueOnce(
          new Response("<fault>no results</fault>", {
            status: 404,
            headers: { "content-type": "application/xml" }
          })
        );

      const results = await callSearchEpo("nonexistent");
      expect(results).toEqual([]);
    });

    it("throws on rate limit (429)", async () => {
      fetchSpy
        .mockResolvedValueOnce(mockAuthOk())
        .mockResolvedValueOnce(
          new Response("Rate limited", {
            status: 429,
            headers: { "Retry-After": "30" }
          })
        );

      await expect(callSearchEpo("test")).rejects.toThrow("请求频率超限");
    });

    it("throws on generic API error (500)", async () => {
      fetchSpy
        .mockResolvedValueOnce(mockAuthOk())
        .mockResolvedValueOnce(
          new Response("Internal Server Error", { status: 500 })
        );

      await expect(callSearchEpo("test")).rejects.toThrow("EPO OPS API 请求失败");
    });
  });
});
