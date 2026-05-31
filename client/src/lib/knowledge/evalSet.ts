/**
 * RAG 质量评估集 — 标准 query + 期望检索结果
 */

export interface EvalCase {
  id: string;
  query: string;
  expectedKeywords: string[];     // 检索结果应包含的关键词
  expectedSources: string[];      // 应命中的来源文件名
  category: "novelty" | "inventive" | "legal" | "procedure" | "mixed";
  description: string;
}

export const RAG_EVAL_SET: EvalCase[] = [
  {
    id: "eval-001",
    query: "新颖性判断的单独对比原则是什么",
    expectedKeywords: ["单独对比", "新颖性", "一篇对比文件"],
    expectedSources: ["专利审查指南"],
    category: "novelty",
    description: "新颖性核心原则：只能用一篇对比文件评价",
  },
  {
    id: "eval-002",
    query: "创造性三步法的具体步骤",
    expectedKeywords: ["最接近现有技术", "区别特征", "技术问题", "显而易见"],
    expectedSources: ["专利审查指南"],
    category: "inventive",
    description: "创造性三步法的完整步骤",
  },
  {
    id: "eval-003",
    query: "专利法第22条规定了什么",
    expectedKeywords: ["新颖性", "创造性", "实用性"],
    expectedSources: ["专利法"],
    category: "legal",
    description: "专利法核心条款",
  },
  {
    id: "eval-004",
    query: "复审请求的审查程序",
    expectedKeywords: ["复审", "审查决定", "合议组"],
    expectedSources: ["专利审查指南"],
    category: "procedure",
    description: "复审程序规定",
  },
  {
    id: "eval-005",
    query: "inventive step 三步法判断",
    expectedKeywords: ["创造性", "最接近现有技术", "区别特征"],
    expectedSources: ["专利审查指南"],
    category: "inventive",
    description: "跨语言检索：英文 query 匹配中文内容",
  },
  {
    id: "eval-006",
    query: "权利要求不清楚的审查标准",
    expectedKeywords: ["清楚", "权利要求", "保护范围"],
    expectedSources: ["专利审查指南"],
    category: "novelty",
    description: "形式缺陷审查标准",
  },
  {
    id: "eval-007",
    query: "修改超范围的判断标准",
    expectedKeywords: ["修改", "超范围", "原始申请"],
    expectedSources: ["专利审查指南", "专利法"],
    category: "legal",
    description: "专利法§33相关审查标准",
  },
  {
    id: "eval-008",
    query: "对比文件公开日如何认定",
    expectedKeywords: ["公开日", "现有技术", "申请日"],
    expectedSources: ["专利审查指南"],
    category: "novelty",
    description: "时间轴校验相关",
  },
  {
    id: "eval-009",
    query: "技术启示的判断方法",
    expectedKeywords: ["技术启示", "结合动机", "区别特征"],
    expectedSources: ["专利审查指南"],
    category: "inventive",
    description: "创造性判断中最难的部分",
  },
  {
    id: "eval-010",
    query: "复审决定的司法审查标准",
    expectedKeywords: ["复审", "司法审查", "专利授权确权"],
    expectedSources: ["最高法"],
    category: "procedure",
    description: "司法解释中的复审审查标准",
  },
];

/** 运行评估并返回结果 */
export async function runEvaluation(
  retrieveFn: (query: string) => Promise<Array<{ chunk: { text: string; metadata: { fileName: string } }; score: number }>>
): Promise<{
  total: number;
  passed: number;
  failed: number;
  results: Array<{
    case: EvalCase;
    passed: boolean;
    matchedKeywords: string[];
    matchedSources: string[];
    resultCount: number;
  }>;
}> {
  const results = [];

  for (const evalCase of RAG_EVAL_SET) {
    const retrieved = await retrieveFn(evalCase.query);
    const retrievedText = retrieved.map((r) => r.chunk.text).join(" ");
    const retrievedSources = retrieved.map((r) => r.chunk.metadata.fileName);

    const matchedKeywords = evalCase.expectedKeywords.filter((kw) =>
      retrievedText.includes(kw)
    );
    const matchedSources = evalCase.expectedSources.filter((src) =>
      retrievedSources.some((rs) => rs.includes(src))
    );

    const passed =
      matchedKeywords.length >= Math.ceil(evalCase.expectedKeywords.length * 0.5) &&
      matchedSources.length > 0;

    results.push({
      case: evalCase,
      passed,
      matchedKeywords,
      matchedSources,
      resultCount: retrieved.length,
    });
  }

  const passed = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}
