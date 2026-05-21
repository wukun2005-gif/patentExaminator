import { describe, it, expect } from "vitest";

import { checkImportGate, getMissingRequiredFiles, getMissingOptionalFiles, type ImportedFile } from "@client/lib/case-gate";
import { matchCitation } from "@client/lib/citationMatch";
import { extractFigureCaptions, isFigureSectionHeader, isLikelyFigurePage, buildFigureId, estimateFigurePages } from "@client/lib/figureExtract";
import { renderCaseMarkdown } from "@client/lib/exportMarkdown";
import { renderCaseHtml, type ExportViewModel } from "@client/lib/exportHtml";
import { buildTextIndex } from "@client/lib/textIndex";
import { detectLanguage } from "@client/lib/languageDetect";
import { parseClaims } from "@client/lib/claimParser";
import { computeBaselineDate, classifyReferenceDate } from "@client/lib/dateRules";
import { parseDate } from "@client/lib/dateParse";
import { sanitizeFileName, buildExportFileName } from "@client/lib/fileNameSanitize";
import { computeOcrQuality } from "@client/lib/ocrQuality";
import { extractCaseFieldsFallback } from "@client/lib/caseFieldExtractor";

import type { Citation, TextIndex } from "@shared/types/domain";

// ═══════════════════════════════════════════════════════════════
// Import Gate — 复审必传文件校验
// ═══════════════════════════════════════════════════════════════
describe("Import Gate (case-gate)", () => {
  function makeFile(overrides: Partial<ImportedFile>): ImportedFile {
    return {
      id: "f-1",
      fileName: "test.pdf",
      fileType: "reexam-request",
      fileSize: 1024,
      mimeType: "application/pdf",
      uploadedAt: "2024-01-01T00:00:00.000Z",
      required: true,
      ...overrides
    };
  }

  it("全部必传文件 + 可选文件齐全 → ready", () => {
    const files: ImportedFile[] = [
      makeFile({ id: "1", fileType: "reexam-request" }),
      makeFile({ id: "2", fileType: "rejection-decision" }),
      makeFile({ id: "3", fileType: "original-application" }),
      makeFile({ id: "4", fileType: "comparison-document" })
    ];
    expect(checkImportGate(files)).toBe("ready");
  });

  it("仅必传文件齐全，缺可选文件 → warning", () => {
    const files: ImportedFile[] = [
      makeFile({ id: "1", fileType: "reexam-request" }),
      makeFile({ id: "2", fileType: "rejection-decision" }),
      makeFile({ id: "3", fileType: "original-application" })
    ];
    expect(checkImportGate(files)).toBe("warning");
  });

  it("缺必传文件 → incomplete", () => {
    const files: ImportedFile[] = [
      makeFile({ id: "1", fileType: "reexam-request" }),
      makeFile({ id: "2", fileType: "rejection-decision" })
    ];
    expect(checkImportGate(files)).toBe("incomplete");
  });

  it("完全无文件 → incomplete", () => {
    expect(checkImportGate([])).toBe("incomplete");
  });

  it("getMissingRequiredFiles → 返回缺失的必传文件类型", () => {
    const files: ImportedFile[] = [
      makeFile({ id: "1", fileType: "reexam-request" })
    ];
    const missing = getMissingRequiredFiles(files);
    expect(missing).toHaveLength(2);
    expect(missing).toContain("rejection-decision");
    expect(missing).toContain("original-application");
  });

  it("getMissingRequiredFiles → 全齐 → 空数组", () => {
    const files: ImportedFile[] = [
      makeFile({ id: "1", fileType: "reexam-request" }),
      makeFile({ id: "2", fileType: "rejection-decision" }),
      makeFile({ id: "3", fileType: "original-application" })
    ];
    expect(getMissingRequiredFiles(files)).toHaveLength(0);
  });

  it("getMissingOptionalFiles → 返回缺失的可选文件类型", () => {
    const files: ImportedFile[] = [
      makeFile({ id: "1", fileType: "reexam-request" })
    ];
    const missing = getMissingOptionalFiles(files);
    expect(missing).toHaveLength(1);
    expect(missing).toContain("comparison-document");
  });
});

// ═══════════════════════════════════════════════════════════════
// Citation Match — 四级引用匹配
// ═══════════════════════════════════════════════════════════════
describe("Citation Match", () => {
  const textIndex: TextIndex = {
    pages: [],
    paragraphs: [
      { id: "p-0", text: "本发明涉及一种LED散热装置，包括散热基板和导热界面层。", startOffset: 0, endOffset: 33, paragraphNumber: "0001" },
      { id: "p-1", text: "散热翅片（A）与导热界面层（B）通过卡扣（C）连接，形成散热通道。", startOffset: 34, endOffset: 83, paragraphNumber: "0002" },
      { id: "p-2", text: "电源管理模块控制电流输出，确保LED工作稳定。", startOffset: 84, endOffset: 118, paragraphNumber: "0003" }
    ],
    lineMap: []
  };

  it("Level 1: 精确段落号匹配 → high confidence", () => {
    const citation: Citation = {
      documentId: "doc-1",
      label: "说明书第0002段",
      paragraph: "0002",
      confidence: "high"
    };
    const result = matchCitation(citation, textIndex);
    expect(result.status).toBe("found");
    expect(result.confidence).toBe("high");
    expect(result.matchedParagraphId).toBe("p-1");
  });

  it("Level 1: 带前导零的段落号匹配（0001 vs 1）", () => {
    const citation: Citation = {
      documentId: "doc-1",
      label: "说明书第0001段",
      paragraph: "1",
      confidence: "high"
    };
    const result = matchCitation(citation, textIndex);
    expect(result.status).toBe("found");
    expect(result.confidence).toBe("high");
  });

  it("Level 2: ±1 邻居段落匹配 → medium confidence", () => {
    const citation: Citation = {
      documentId: "doc-1",
      label: "第3段附近",
      paragraph: "0003",
      confidence: "medium"
    };
    const result = matchCitation(citation, textIndex);
    expect(result.status).toBe("found");
    expect(result.confidence).toBe("high");
  });

  it("Level 3: 引用文本子串搜索（≥10 chars，唯一匹配）→ medium", () => {
    const citation: Citation = {
      documentId: "doc-1",
      label: "LED散热装置",
      quote: "LED散热装置，包括散热基板和导热界面层",
      confidence: "medium"
    };
    const result = matchCitation(citation, textIndex);
    expect(result.status).toBe("found");
    expect(result.confidence).toBe("medium");
    expect(result.matchedParagraphId).toBe("p-0");
  });

  it("Level 3: 引用文本匹配不到 → not-found", () => {
    const citation: Citation = {
      documentId: "doc-1",
      label: "不存在的描述",
      quote: "这句话在原文中完全不存在",
      confidence: "low"
    };
    const result = matchCitation(citation, textIndex);
    expect(result.status).toBe("not-found");
  });

  it("Level 4: 无 paragraph 无 quote → not-found", () => {
    const citation: Citation = {
      documentId: "doc-1",
      label: "",
      confidence: "low"
    };
    const result = matchCitation(citation, textIndex);
    expect(result.status).toBe("not-found");
  });

  it("引用文本 < 10 字符 → 不触发子串搜索", () => {
    const citation: Citation = {
      documentId: "doc-1",
      label: "短引用",
      quote: "散热",
      confidence: "low"
    };
    const result = matchCitation(citation, textIndex);
    expect(result.status).toBe("not-found");
  });

  it("段落号不存在 → 降级到子串搜索", () => {
    const citation: Citation = {
      documentId: "doc-1",
      label: "第999段",
      paragraph: "999",
      quote: "LED散热装置，包括散热基板和导热界面层",
      confidence: "low"
    };
    const result = matchCitation(citation, textIndex);
    expect(result.status).toBe("found");
    expect(result.confidence).toBe("medium");
  });
});

// ═══════════════════════════════════════════════════════════════
// Figure Extraction — 附图识别逻辑
// ═══════════════════════════════════════════════════════════════
describe("Figure Extraction (figureExtract)", () => {
  it("extractFigureCaptions → 中文图号", () => {
    const text = "图1是本发明的结构示意图\n图2是电路连接图";
    const captions = extractFigureCaptions(text);
    expect(captions).toHaveLength(2);
    expect(captions[0]!.number).toBe(1);
    expect(captions[0]!.caption).toBe("本发明的结构示意图");
    expect(captions[1]!.number).toBe(2);
    expect(captions[1]!.caption).toBe("电路连接图");
  });

  it("extractFigureCaptions → 英文 Fig. 格式", () => {
    const text = "Fig.1 is a block diagram\nFig.2 shows the circuit";
    const captions = extractFigureCaptions(text);
    expect(captions).toHaveLength(2);
    expect(captions[0]!.number).toBe(1);
    expect(captions[1]!.number).toBe(2);
  });

  it("extractFigureCaptions → 去重并按编号排序", () => {
    const text = "图3...\n图1...\n图3 again...\n图2...";
    const captions = extractFigureCaptions(text);
    expect(captions).toHaveLength(3);
    expect(captions.map((c) => c.number)).toEqual([1, 2, 3]);
  });

  it("extractFigureCaptions → 过滤无效图号（>200 或 0）", () => {
    const text = "图0是无效\n图1是有效\n图999999是超大";
    const captions = extractFigureCaptions(text);
    expect(captions).toHaveLength(1);
    expect(captions[0]!.number).toBe(1);
  });

  it("isFigureSectionHeader → 中文附图标题", () => {
    expect(isFigureSectionHeader("附图说明")).toBe(true);
    expect(isFigureSectionHeader("说明书附图")).toBe(true);
    expect(isFigureSectionHeader("技术领域")).toBe(false);
    expect(isFigureSectionHeader("权利要求书")).toBe(false);
  });

  it("isFigureSectionHeader → 英文标题", () => {
    expect(isFigureSectionHeader("Brief Description of the Drawings")).toBe(true);
    expect(isFigureSectionHeader("DESCRIPTION OF DRAWINGS")).toBe(true);
  });

  it("isLikelyFigurePage → 空文本 → true", () => {
    expect(isLikelyFigurePage("")).toBe(true);
  });

  it("isLikelyFigurePage → 短文本（<50 chars）→ true", () => {
    expect(isLikelyFigurePage("图1")).toBe(true);
  });

  it("isLikelyFigurePage → 长文本但大量图标签 → true", () => {
    const text = Array.from({ length: 20 }, (_, i) => `图${i + 1}`).join("\n");
    expect(isLikelyFigurePage(text)).toBe(true);
  });

  it("isLikelyFigurePage → 普通文本页 → false", () => {
    const text = "本发明涉及一种LED散热装置。具体实施方式中，散热基板采用铜材料制成...  ".repeat(10);
    expect(isLikelyFigurePage(text)).toBe(false);
  });

  it("buildFigureId → 正确格式", () => {
    expect(buildFigureId("doc-1", 3)).toBe("doc-1_fig3");
    expect(buildFigureId("abc-123", 42)).toBe("abc-123_fig42");
  });

  it("estimateFigurePages → 从附图说明章节分配页面", () => {
    const captions = [{ number: 1, caption: "结构示意图" }];
    const pageTexts = [
      "技术领域\n...",          // page 0
      "附图说明\n图1是...",     // page 1 (figure section start)
      "图1\n散热装置",          // page 2
    ];
    const result = estimateFigurePages(captions, 3, pageTexts);
    expect(result.has(1)).toBe(true);
    expect(result.get(1)).toContain(1);
    expect(result.get(1)).toContain(2);
  });

  it("estimateFigurePages → 无 figure section → 基于推断", () => {
    const captions = [{ number: 1, caption: "结构示意图" }];
    const pageTexts = [
      "详细描述\n图1是结构图",
    ];
    const result = estimateFigurePages(captions, 1, pageTexts);
    expect(result.has(1)).toBe(true);
    expect(result.get(1)!.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Text Index — 文本索引构建
// ═══════════════════════════════════════════════════════════════
describe("Text Index (buildTextIndex)", () => {
  it("简单文本 → 正确分段", () => {
    const text = "段落一内容\n\n段落二内容\n\n段落三内容";
    const index = buildTextIndex(text);
    expect(index.paragraphs).toHaveLength(3);
    expect(index.paragraphs[0]!.text).toBe("段落一内容");
    expect(index.paragraphs[1]!.text).toBe("段落二内容");
    expect(index.paragraphs[2]!.text).toBe("段落三内容");
  });

  it("带段落编号的文本 → 提取段落号", () => {
    const text = "[0001] 这是第一个段落\n\n[0002] 这是第二个段落";
    const index = buildTextIndex(text);
    expect(index.paragraphs).toHaveLength(2);
    expect(index.paragraphs[0]!.paragraphNumber).toBe("0001");
    expect(index.paragraphs[1]!.paragraphNumber).toBe("0002");
  });

  it("空文本 → 空索引", () => {
    const index = buildTextIndex("");
    expect(index.paragraphs).toHaveLength(0);
    expect(index.pages).toHaveLength(0);
  });

  it("行映射 → 行号从 1 开始", () => {
    const text = "第一行\n第二行\n第三行";
    const index = buildTextIndex(text);
    expect(index.lineMap).toHaveLength(3);
    expect(index.lineMap[0]!.line).toBe(1);
    expect(index.lineMap[1]!.line).toBe(2);
    expect(index.lineMap[2]!.line).toBe(3);
  });

  it("段落 offset 正确", () => {
    const text = "AA\n\nBBBB";
    const index = buildTextIndex(text);
    expect(index.paragraphs).toHaveLength(2);
    expect(index.paragraphs[0]!.startOffset).toBe(0);
    expect(index.paragraphs[0]!.endOffset).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// Language Detection — CJK 语言检测
// ═══════════════════════════════════════════════════════════════
describe("Language Detection", () => {
  it("纯中文文本 → zh", () => {
    expect(detectLanguage("本发明涉及一种LED散热装置")).toBe("zh");
  });

  it("中英混合但中文比例 ≥ 30% → zh", () => {
    const text = "本发明涉及一种散热装置，including a heatsink and a fan. 散热装置由金属制成。";
    expect(detectLanguage(text)).toBe("zh");
  });

  it("纯英文文本 → en", () => {
    expect(detectLanguage("The present invention relates to a heat dissipation device for LED lighting.")).toBe("en");
  });

  it("空文本 → other", () => {
    expect(detectLanguage("")).toBe("other");
    expect(detectLanguage("   ")).toBe("other");
  });

  it("极少中文（< 30%）→ en", () => {
    const enWithOneChar = "This is a patent application document for LED cooling system 散";
    expect(detectLanguage(enWithOneChar)).toBe("en");
  });
});

// ═══════════════════════════════════════════════════════════════
// Claim Parsing — 权利要求结构解析
// ═══════════════════════════════════════════════════════════════
describe("Claim Parsing (parseClaims)", () => {
  const CASE_ID = "test-case";

  it("解析独立权利要求 → type=independent", () => {
    const text = `权利要求书
1. 一种LED散热装置，包括散热基板和导热界面层。
2. 根据权利要求1所述的散热装置，还包括散热风扇。`;
    const result = parseClaims(text, CASE_ID);
    expect(result.claims).toHaveLength(2);
    expect(result.claims[0]!.type).toBe("independent");
    expect(result.claims[0]!.claimNumber).toBe(1);
    expect(result.claims[0]!.dependsOn).toHaveLength(0);
  });

  it("解析从属权利要求 → type=dependent，解析依赖关系", () => {
    const text = `权利要求书
1. 一种装置，包括A和B。
2. 根据权利要求1所述的装置，还包括C。
3. 根据权利要求1或2所述的装置，还包括D。`;
    const result = parseClaims(text, CASE_ID);
    expect(result.claims).toHaveLength(3);
    expect(result.claims[1]!.type).toBe("dependent");
    expect(result.claims[1]!.dependsOn).toEqual([1]);
    expect(result.claims[2]!.dependsOn).toEqual([1, 2]);
  });

  it("无权利要求书标题 → fallback 到首条权利要求", () => {
    const text = "1. 一种LED散热装置。";
    const result = parseClaims(text, CASE_ID);
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]!.claimNumber).toBe(1);
  });

  it("无权利要求 → warnings 包含 no-claim-region", () => {
    const text = "说明书内容，没有任何权利要求。";
    const result = parseClaims(text, CASE_ID);
    expect(result.claims).toHaveLength(0);
    expect(result.warnings).toContain("no-claim-region");
  });

  it("无独立权利要求 → warnings 包含 no-independent-claim", () => {
    const text = `权利要求书
1. 根据权利要求1所述的装置，其中...`;
    const result = parseClaims(text, CASE_ID);
    expect(result.warnings).toContain("no-independent-claim");
  });

  it("编号不连续 → warnings 包含 gap-in-claim-numbers", () => {
    const text = `权利要求书
1. 一种装置。
5. 根据权利要求1所述的装置。`;
    const result = parseClaims(text, CASE_ID);
    expect(result.warnings.some((w) => w.startsWith("gap-in-claim-numbers"))).toBe(true);
  });

  it("self-dependency — 引用自身 → 标记 invalid dependency", () => {
    const text = `权利要求书
1. 一种装置。
2. 根据权利要求2所述的装置。`;
    const result = parseClaims(text, CASE_ID);
    expect(result.warnings.some((w) => w.includes("invalid-dependency"))).toBe(true);
  });

  it("范围依赖 '权利要求 N 至 M'", () => {
    const text = `权利要求书
1. 一种装置。
2. 根据权利要求1至3所述的装置。`;
    const result = parseClaims(text, CASE_ID);
    expect(result.claims[1]!.dependsOn).toContain(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Date Rules — 时间轴规则
// ═══════════════════════════════════════════════════════════════
describe("Date Rules", () => {
  it("computeBaselineDate → 优先使用 priorityDate", () => {
    const result = computeBaselineDate({
      applicationDate: "2023-03-15",
      priorityDate: "2022-06-01"
    });
    expect(result).toBe("2022-06-01");
  });

  it("computeBaselineDate → 无 priorityDate 时使用 applicationDate", () => {
    const result = computeBaselineDate({
      applicationDate: "2023-03-15"
    });
    expect(result).toBe("2023-03-15");
  });

  it("computeBaselineDate → 无日期时返回 undefined", () => {
    const result = computeBaselineDate({});
    expect(result).toBeUndefined();
  });

  it("classifyReferenceDate → pubDate < baselineDate → available", () => {
    expect(classifyReferenceDate("2023-03-15", "2022-01-01")).toBe("available");
  });

  it("classifyReferenceDate → pubDate === baselineDate → unavailable-same-day", () => {
    expect(classifyReferenceDate("2023-03-15", "2023-03-15")).toBe("unavailable-same-day");
  });

  it("classifyReferenceDate → pubDate > baselineDate → unavailable-later", () => {
    expect(classifyReferenceDate("2023-03-15", "2024-01-01")).toBe("unavailable-later");
  });

  it("classifyReferenceDate → 无 pubDate → needs-publication-date", () => {
    expect(classifyReferenceDate("2023-03-15", undefined)).toBe("needs-publication-date");
  });

  it("classifyReferenceDate → 无 baselineDate → needs-baseline-date", () => {
    expect(classifyReferenceDate(undefined, "2023-03-15")).toBe("needs-baseline-date");
  });
});

// ═══════════════════════════════════════════════════════════════
// Date Parse — 日期解析
// ═══════════════════════════════════════════════════════════════
describe("Date Parse (parseDate)", () => {
  it("ISO 格式 → high confidence", () => {
    const result = parseDate("2024-01-15");
    expect(result?.iso).toBe("2024-01-15");
    expect(result?.confidence).toBe("high");
  });

  it("中文格式 YYYY年M月D日 → medium confidence（零填充）", () => {
    const result = parseDate("2024年1月15日");
    expect(result?.iso).toBe("2024-01-15");
    expect(result?.confidence).toBe("medium");
  });

  it("Slash 格式 YYYY/M/D → medium confidence（零填充）", () => {
    const result = parseDate("2024/1/15");
    expect(result?.iso).toBe("2024-01-15");
    expect(result?.confidence).toBe("medium");
  });

  it("Dot 格式 YYYY.M.D → medium confidence（零填充）", () => {
    const result = parseDate("2024.1.15");
    expect(result?.iso).toBe("2024-01-15");
    expect(result?.confidence).toBe("medium");
  });

  it("English 格式 Month D, YYYY → medium confidence", () => {
    const result = parseDate("March 15, 2024");
    expect(result?.iso).toBe("2024-03-15");
    expect(result?.confidence).toBe("medium");
  });

  it("Partial YYYY-MM → low confidence", () => {
    const result = parseDate("2024-03");
    expect(result?.iso).toBe("2024-03-01");
    expect(result?.confidence).toBe("low");
  });

  it("无效日期 → undefined", () => {
    expect(parseDate("not-a-date")).toBeUndefined();
    expect(parseDate("")).toBeUndefined();
  });

  it("非法日期 → undefined", () => {
    expect(parseDate("2024年13月1日")).toBeUndefined();
    expect(parseDate("")).toBeUndefined();
    expect(parseDate("not-a-date")).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// File Name Sanitize — 文件名安全处理
// ═══════════════════════════════════════════════════════════════
describe("File Name Sanitize", () => {
  it("替换非法字符为下划线", () => {
    expect(sanitizeFileName("test/file:name*test")).toBe("test_file_name_test");
  });

  it("连续多个下划线压缩为一个", () => {
    expect(sanitizeFileName("test///file")).toBe("test_file");
  });

  it("去除首尾下划线", () => {
    expect(sanitizeFileName("_test_")).toBe("test");
  });

  it("buildExportFileName → 序列号为 0 时不追加", () => {
    const name = buildExportFileName("CN202410000001A", "LED散热装置", "draft", "2024-01-15", 0);
    expect(name).not.toContain("_0");
  });

  it("buildExportFileName → 序列号 > 0 时追加", () => {
    const name = buildExportFileName("CN202410000001A", "LED散热装置", "draft", "2024-01-15", 2);
    expect(name).toContain("_2");
  });

  it("buildExportFileName → 超长标题截断", () => {
    const longTitle = "A".repeat(100);
    const name = buildExportFileName("CN202410000001A", longTitle, "draft", "2024-01-15");
    expect(name.length).toBeLessThan(longTitle.length + 50);
  });
});

// ═══════════════════════════════════════════════════════════════
// OCR Quality — OCR 质量评估
// ═══════════════════════════════════════════════════════════════
describe("OCR Quality (computeOcrQuality)", () => {
  it("高质量文本 → good", () => {
    const pages = [
      "本发明涉及一种LED散热装置，包括散热基板和导热界面层。\n".repeat(10),
      "散热翅片通过卡扣连接，形成散热通道。具体实施方式如下。\n".repeat(10),
    ];
    const result = computeOcrQuality(pages);
    expect(result.level).toBe("good");
    expect(result.score).toBeGreaterThanOrEqual(0.7);
  });

  it("完全垃圾字符 → bad", () => {
    const pages = ["\x00\x01\x02\x03\n\x7F\x80\x90"];
    const result = computeOcrQuality(pages);
    expect(result.level).toBe("bad");
    expect(result.score).toBeLessThan(0.4);
  });

  it("空页 → 计入 shortPage", () => {
    const pages = ["", ""];
    const result = computeOcrQuality(pages);
    expect(result.level).toBe("poor");
    expect(result.shortPageRatio).toBe(1);
  });

  it("混合质量 → 偏向好文本侧", () => {
    const good = "本发明涉及散热装置。具体实施例如下。\n".repeat(20);
    const bad = "\x00\x01\x02\x03\n\x7F\n".repeat(5);
    const result = computeOcrQuality([good, good, bad]);
    expect(result.score).toBeGreaterThan(0);
    expect(result.junkRatio).toBeGreaterThan(0);
    expect(result.shortPageRatio).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Case Field Extraction Fallback — 案卷字段提取（回退模式）
// ═══════════════════════════════════════════════════════════════
describe("Case Field Extraction Fallback", () => {
  it("提取发明名称 → 发明名称：XXX", () => {
    const docs = [{
      fileName: "申请文件.pdf",
      text: "发明名称：一种LED散热装置\n申请号：CN202410567890A\n申请人：张三\n申请日：2024年3月15日"
    }];
    const result = extractCaseFieldsFallback(docs, "case-1");
    expect(result.title).toBe("一种LED散热装置");
    expect(result.confidence.title).toBe("high");
  });

  it("提取申请号", () => {
    const docs = [{
      fileName: "申请文件.pdf",
      text: "申请号：CN202410567890A\n发明名称：一种装置"
    }];
    const result = extractCaseFieldsFallback(docs, "case-1");
    expect(result.applicationNumber).toBe("CN202410567890A");
    expect(result.confidence.applicationNumber).toBe("high");
  });

  it("提取申请日", () => {
    const docs = [{
      fileName: "申请文件.pdf",
      text: "申请日：2024年3月15日\n发明名称：一种装置"
    }];
    const result = extractCaseFieldsFallback(docs, "case-1");
    expect(result.applicationDate).toBe("2024-03-15");
  });

  it("提取优先权日", () => {
    const docs = [{
      fileName: "申请文件.pdf",
      text: "优先权日：2023年6月1日\n发明名称：一种装置"
    }];
    const result = extractCaseFieldsFallback(docs, "case-1");
    expect(result.priorityDate).toBe("2023-06-01");
  });

  it("提取申请人", () => {
    const docs = [{
      fileName: "申请文件.pdf",
      text: "申请人：某科技有限公司\n发明名称：一种装置"
    }];
    const result = extractCaseFieldsFallback(docs, "case-1");
    expect(result.applicant).toBe("某科技有限公司");
  });

  it("从 fallback 提取权利要求", () => {
    const docs = [{
      fileName: "申请文件.pdf",
      text: `权利要求书
1. 一种装置，包括A和B。
2. 根据权利要求1所述的装置，还包括C。`
    }];
    const result = extractCaseFieldsFallback(docs, "case-1");
    expect(result.claims.length).toBeGreaterThanOrEqual(1);
    expect(result.targetClaimNumber).toBe(1);
  });

  it("无标签文档 → 返回 null 字段", () => {
    const docs = [{ fileName: "empty.pdf", text: "没有任何标签的纯文本" }];
    const result = extractCaseFieldsFallback(docs, "case-1");
    expect(result.title).toBeNull();
    expect(result.applicationNumber).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Export — 导出（Markdown / HTML）
// ═══════════════════════════════════════════════════════════════
describe("Export (Markdown / HTML)", () => {
  const baseViewModel: ExportViewModel = {
    caseData: {
      id: "case-1",
      applicationNumber: "CN2023100000001",
      title: "LED散热装置",
      applicationDate: "2023-03-15",
      patentType: "invention",
      textVersion: "original",
      targetClaimNumber: 1,
      guidelineVersion: "2023",
      reexaminationRound: 1,
      workflowState: "draft-ready",
      createdAt: "2023-03-15T00:00:00.000Z",
      updatedAt: "2023-03-15T00:00:00.000Z"
    },
    claimFeatures: [
      { id: "f-1", caseId: "case-1", claimNumber: 1, featureCode: "A", description: "一种LED散热装置", specificationCitations: [], citationStatus: "confirmed", source: "mock" },
    ],
    noveltyComparisons: [],
    differenceFeatureCodes: [],
    pendingSearchQuestions: [],
  };

  it("renderCaseMarkdown → 基础案件信息渲染", () => {
    const md = renderCaseMarkdown(baseViewModel);
    expect(md).toContain("CN2023100000001");
    expect(md).toContain("LED散热装置");
    expect(md).toContain("特征代码");
    expect(md).toContain("特征描述");
  });

  it("renderCaseMarkdown → 含区别特征", () => {
    const vm = { ...baseViewModel, differenceFeatureCodes: ["B", "C"] };
    const md = renderCaseMarkdown(vm);
    expect(md).toContain("区别特征候选");
    expect(md).toContain("- B");
    expect(md).toContain("- C");
  });

  it("renderCaseMarkdown → 含待检索问题", () => {
    const vm = { ...baseViewModel, pendingSearchQuestions: ["如何检索散热基板"] };
    const md = renderCaseMarkdown(vm);
    expect(md).toContain("待检索问题清单");
    expect(md).toContain("如何检索散热基板");
  });

  it("renderCaseMarkdown → 含创造性分析", () => {
    const vm: ExportViewModel = {
      ...baseViewModel,
      inventiveAnalysis: {
        id: "inv-1",
        caseId: "case-1",
        sharedFeatureCodes: ["A"],
        distinguishingFeatureCodes: ["B"],
        status: "draft",
        motivationEvidence: [],
        candidateAssessment: "possibly-lacks-inventiveness",
        cautions: ["需要进一步核实"],
        legalCaution: "候选分析"
      }
    };
    const md = renderCaseMarkdown(vm);
    expect(md).toContain("创造性三步法分析");
    expect(md).toContain("可能缺乏创造性");
    expect(md).toContain("需要进一步核实");
  });

  it("renderCaseMarkdown → 含形式缺陷", () => {
    const vm: ExportViewModel = {
      ...baseViewModel,
      defects: [
        { id: "d-1", caseId: "case-1", category: "权利要求", description: "引用不明", severity: "error", resolved: false }
      ]
    };
    const md = renderCaseMarkdown(vm);
    expect(md).toContain("形式缺陷检查");
    expect(md).toContain("引用不明");
    expect(md).toContain("严重");
  });

  it("renderCaseMarkdown → 含复审意见草稿", () => {
    const vm: ExportViewModel = {
      ...baseViewModel,
      reexamDraft: {
        claimNumber: 1,
        responseItems: [{
          rejectionGroundCode: "NOV-1",
          category: "新颖性",
          applicantArgumentSummary: "D1未公开B",
          examinerResponse: "经审查采纳",
          conclusion: "argument-accepted",
          supportingEvidence: [{ label: "D1-5", quote: "原文引用", confidence: "high" }]
        }],
        overallAssessment: "答辩部分成立",
        legalCaution: "候选分析"
      }
    };
    const md = renderCaseMarkdown(vm);
    expect(md).toContain("复审意见草稿");
    expect(md).toContain("NOV-1");
    expect(md).toContain("答辩成立");
    expect(md).toContain("原文引用");
  });

  it("renderCaseMarkdown → 含 Summary", () => {
    const vm: ExportViewModel = {
      ...baseViewModel,
      summary: {
        body: "本案核心争议是新颖性",
        aiNotes: "需要核查对比文件",
        legalCaution: "候选分析"
      }
    };
    const md = renderCaseMarkdown(vm);
    expect(md).toContain("审查意见简述");
    expect(md).toContain("本案核心争议是新颖性");
  });

  it("renderCaseHtml → 生成有效 HTML", () => {
    const html = renderCaseHtml(baseViewModel);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("CN2023100000001");
    expect(html).toContain("LED散热装置");
    expect(html).toContain("</html>");
  });

  it("renderCaseHtml → 含 priorityDate 时渲染", () => {
    const vm: ExportViewModel = {
      ...baseViewModel,
      caseData: { ...baseViewModel.caseData, priorityDate: "2022-06-01" }
    };
    const html = renderCaseHtml(vm);
    expect(html).toContain("2022-06-01");
    expect(html).toContain("优先权日");
  });

  it("renderCaseHtml → 含复审 draft 时渲染", () => {
    const vm: ExportViewModel = {
      ...baseViewModel,
      reexamDraft: {
        claimNumber: 1,
        responseItems: [{
          rejectionGroundCode: "INV-1",
          category: "创造性",
          applicantArgumentSummary: "组合非显而易见",
          examinerResponse: "维持驳回",
          conclusion: "argument-rejected",
          supportingEvidence: [{ label: "D2", quote: "启示", confidence: "high" }]
        }],
        overallAssessment: "维持驳回",
        defectReviewSummary: "缺陷已克服",
        legalCaution: "候选分析"
      }
    };
    const html = renderCaseHtml(vm);
    expect(html).toContain("复审意见草稿");
    expect(html).toContain("INV-1");
    expect(html).toContain("答辩不成立");
    expect(html).toContain("缺陷已克服");
  });
});