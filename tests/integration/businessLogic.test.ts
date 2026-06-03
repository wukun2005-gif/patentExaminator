import { describe, it, expect } from "vitest";

// case-gate tests removed — ImportPage.tsx deleted in B-023, replaced by CaseSetupPage
import { renderCaseHtml, type ExportViewModel } from "@client/lib/exportHtml";
import { buildTextIndex } from "@client/lib/textIndex";
import { detectLanguage } from "@client/lib/languageDetect";
import { parseClaims } from "@client/lib/claimParser";
import { computeBaselineDate, classifyReferenceDate } from "@client/lib/dateRules";
import { parseDate } from "@client/lib/dateParse";
import { sanitizeFileName, buildExportFileName } from "@client/lib/fileNameSanitize";
import { extractCaseFieldsFallback } from "@client/lib/caseFieldExtractor";

// Dead test sections removed: Citation Match, Figure Extraction, OCR Quality (source modules deleted)

// ═══════════════════════════════════════════════════════════════
// Text Index — 文本索引构建
// ═══════════════════════════════════════════════════════════════
describe("Text Index (buildTextIndex)", () => {
  it("简单文本 → 正确分段", async () => {
    const text = "段落一内容\n\n段落二内容\n\n段落三内容";
    const index = await buildTextIndex(text);
    expect(index.paragraphs).toHaveLength(3);
    expect(index.paragraphs[0]!.text).toBe("段落一内容");
    expect(index.paragraphs[1]!.text).toBe("段落二内容");
    expect(index.paragraphs[2]!.text).toBe("段落三内容");
  });

  it("带段落编号的文本 → 提取段落号", async () => {
    const text = "[0001] 这是第一个段落\n\n[0002] 这是第二个段落";
    const index = await buildTextIndex(text);
    expect(index.paragraphs).toHaveLength(2);
    expect(index.paragraphs[0]!.paragraphNumber).toBe("0001");
    expect(index.paragraphs[1]!.paragraphNumber).toBe("0002");
  });

  it("空文本 → 空索引", async () => {
    const index = await buildTextIndex("");
    expect(index.paragraphs).toHaveLength(0);
    expect(index.pages).toHaveLength(0);
  });

  it("行映射 → 行号从 1 开始", async () => {
    const text = "第一行\n第二行\n第三行";
    const index = await buildTextIndex(text);
    expect(index.lineMap).toHaveLength(3);
    expect(index.lineMap[0]!.line).toBe(1);
    expect(index.lineMap[1]!.line).toBe(2);
    expect(index.lineMap[2]!.line).toBe(3);
  });

  it("段落 offset 正确", async () => {
    const text = "AA\n\nBBBB";
    const index = await buildTextIndex(text);
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

  it("解析独立权利要求 → type=independent", async () => {
    const text = `权利要求书
1. 一种LED散热装置，包括散热基板和导热界面层。
2. 根据权利要求1所述的散热装置，还包括散热风扇。`;
    const result = await parseClaims(text, CASE_ID);
    expect(result.claims).toHaveLength(2);
    expect(result.claims[0]!.type).toBe("independent");
    expect(result.claims[0]!.claimNumber).toBe(1);
    expect(result.claims[0]!.dependsOn).toHaveLength(0);
  });

  it("解析从属权利要求 → type=dependent，解析依赖关系", async () => {
    const text = `权利要求书
1. 一种装置，包括A和B。
2. 根据权利要求1所述的装置，还包括C。
3. 根据权利要求1或2所述的装置，还包括D。`;
    const result = await parseClaims(text, CASE_ID);
    expect(result.claims).toHaveLength(3);
    expect(result.claims[1]!.type).toBe("dependent");
    expect(result.claims[1]!.dependsOn).toEqual([1]);
    expect(result.claims[2]!.dependsOn).toEqual([1, 2]);
  });

  it("无权利要求书标题 → fallback 到首条权利要求", async () => {
    const text = "1. 一种LED散热装置。";
    const result = await parseClaims(text, CASE_ID);
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]!.claimNumber).toBe(1);
  });

  it("无权利要求 → warnings 包含 no-claim-region", async () => {
    const text = "说明书内容，没有任何权利要求。";
    const result = await parseClaims(text, CASE_ID);
    expect(result.claims).toHaveLength(0);
    expect(result.warnings).toContain("no-claim-region");
  });

  it("无独立权利要求 → warnings 包含 no-independent-claim", async () => {
    const text = `权利要求书
1. 根据权利要求1所述的装置，其中...`;
    const result = await parseClaims(text, CASE_ID);
    expect(result.warnings).toContain("no-independent-claim");
  });

  it("编号不连续 → warnings 包含 gap-in-claim-numbers", async () => {
    const text = `权利要求书
1. 一种装置。
5. 根据权利要求1所述的装置。`;
    const result = await parseClaims(text, CASE_ID);
    expect(result.warnings.some((w) => w.startsWith("gap-in-claim-numbers"))).toBe(true);
  });

  it("self-dependency — 引用自身 → 标记 invalid dependency", async () => {
    const text = `权利要求书
1. 一种装置。
2. 根据权利要求2所述的装置。`;
    const result = await parseClaims(text, CASE_ID);
    expect(result.warnings.some((w) => w.includes("invalid-dependency"))).toBe(true);
  });

  it("范围依赖 '权利要求 N 至 M'", async () => {
    const text = `权利要求书
1. 一种装置。
2. 根据权利要求1至3所述的装置。`;
    const result = await parseClaims(text, CASE_ID);
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
// Case Field Extraction Fallback — 案卷字段提取（回退模式）
// ═══════════════════════════════════════════════════════════════
describe("Case Field Extraction Fallback", () => {
  it("提取发明名称 → 发明名称：XXX", async () => {
    const docs = [{
      fileName: "申请文件.pdf",
      text: "发明名称：一种LED散热装置\n申请号：CN202410567890A\n申请人：张三\n申请日：2024年3月15日"
    }];
    const result = await extractCaseFieldsFallback(docs, "case-1");
    expect(result.title).toBe("一种LED散热装置");
    expect(result.confidence.title).toBe("high");
  });

  it("提取申请号", async () => {
    const docs = [{
      fileName: "申请文件.pdf",
      text: "申请号：CN202410567890A\n发明名称：一种装置"
    }];
    const result = await extractCaseFieldsFallback(docs, "case-1");
    expect(result.applicationNumber).toBe("CN202410567890A");
    expect(result.confidence.applicationNumber).toBe("high");
  });

  it("提取申请日", async () => {
    const docs = [{
      fileName: "申请文件.pdf",
      text: "申请日：2024年3月15日\n发明名称：一种装置"
    }];
    const result = await extractCaseFieldsFallback(docs, "case-1");
    expect(result.applicationDate).toBe("2024-03-15");
  });

  it("提取优先权日", async () => {
    const docs = [{
      fileName: "申请文件.pdf",
      text: "优先权日：2023年6月1日\n发明名称：一种装置"
    }];
    const result = await extractCaseFieldsFallback(docs, "case-1");
    expect(result.priorityDate).toBe("2023-06-01");
  });

  it("提取申请人", async () => {
    const docs = [{
      fileName: "申请文件.pdf",
      text: "申请人：某科技有限公司\n发明名称：一种装置"
    }];
    const result = await extractCaseFieldsFallback(docs, "case-1");
    expect(result.applicant).toBe("某科技有限公司");
  });

  it("从 fallback 提取权利要求", async () => {
    const docs = [{
      fileName: "申请文件.pdf",
      text: `权利要求书
1. 一种装置，包括A和B。
2. 根据权利要求1所述的装置，还包括C。`
    }];
    const result = await extractCaseFieldsFallback(docs, "case-1");
    expect(result.claims.length).toBeGreaterThanOrEqual(1);
    expect(result.targetClaimNumber).toBe(1);
  });

  it("无标签文档 → 返回 null 字段", async () => {
    const docs = [{ fileName: "empty.pdf", text: "没有任何标签的纯文本" }];
    const result = await extractCaseFieldsFallback(docs, "case-1");
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