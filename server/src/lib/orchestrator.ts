/**
 * 服务端编排器 — B-035: 将 AgentClient 协调逻辑迁移到服务端
 *
 * 职责：
 * 1. 根据 agent 类型构造 prompt
 * 2. 知识库增强
 * 3. 调用 AI Gateway
 * 4. 返回结果
 */
import { logger } from "./logger.js";
import type { ChatRequest } from "../providers/ProviderAdapter.js";

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

// ── 类型定义 ──────────────────────────────────────────

export interface AgentRunRequest {
  agent: string;
  caseId: string;
  request: Record<string, unknown>;
  providerPreference?: string[];
  modelId?: string;
  modelFallbacks?: Record<string, string[]>;
  enableModelFallback?: Record<string, boolean>;
  providerBaseUrls?: Record<string, string>;
  maxTokens?: number;
  signal?: AbortSignal;
  /** bg-75: 用户是否启用了知识库 */
  knowledgeEnabled?: boolean;
  /** B-041: 请求体传入的 API key（测试/外部调用用），优先于 keyStore */
  apiKey?: string;
}

export interface AgentRunResponse {
  ok: boolean;
  output?: unknown;
  tokenUsage?: { input: number; output: number; total: number };
  attempts?: Array<{ providerId: string; modelId: string; errorCode?: string; duration: number }>;
  error?: { type: string; message: string };
  knowledgeCitations?: Array<{ source: string; score: number; excerpt: string }>;
}

// ── Prompt 构造器 ──────────────────────────────────────

function buildClaimChartPrompt(request: Record<string, unknown>): string {
  const claimNumber = request.claimNumber as number ?? 1;
  const claimText = request.claimText as string ?? "";
  const specificationText = request.specificationText as string ?? "";
  const specExcerpt = specificationText.length > 8000 ? specificationText.slice(0, 8000) : specificationText;

  return [
    `你是一位资深专利审查员助理，任务是对权利要求 ${claimNumber} 进行技术特征拆解（Claim Chart）。`,
    ``,
    `约束：`,
    `- 只能基于给定的权利要求文本与说明书片段；不得编造段落号或引用。`,
    `- 每个技术特征必须给出可映射到说明书段落号的 specificationCitations；若无法定位，citationStatus 必须为 "needs-review"。`,
    `- 不得输出新颖性/创造性等法律结论。`,
    `- 严格按下方 JSON 格式输出，不要输出 markdown 代码块或任何解释性文字。`,
    ``,
    `权利要求 ${claimNumber} 文本：`,
    claimText,
    ``,
    `说明书片段（含段落号，如有）：`,
    specExcerpt || "（未提供说明书片段）",
    ``,
    `请严格输出以下 JSON 格式（字段名必须完全一致，使用双引号）：`,
    `{`,
    `  "claimNumber": ${claimNumber},`,
    `  "features": [`,
    `    {`,
    `      "featureCode": "A",`,
    `      "description": "技术特征描述",`,
    `      "specificationCitations": [`,
    `        { "label": "[0001]", "paragraph": "0001", "quote": "说明书原文摘录", "confidence": "high" }`,
    `      ],`,
    `      "citationStatus": "confirmed"`,
    `    }`,
    `  ],`,
    `  "warnings": [`,
    `    { "type": "other", "message": "可选警告说明" }`,
    `  ],`,
    `  "pendingSearchQuestions": ["待检索问题，最多5条"],`,
    `  "legalCaution": "以上为候选事实整理，不构成法律结论。"`,
    `}`,
    ``,
    `注意：`,
    `- featureCode 使用大写字母 A、B、C…（从 A 起连续编号）`,
    `- features 至少 1 项；citationStatus 只能是 confirmed / needs-review / not-found`,
    `- specificationCitations 中 confidence 只能是 high / medium / low`,
    `- warnings 可为空数组 []；pendingSearchQuestions 最多 5 条`
  ].join("\n");
}

function buildNoveltyPrompt(request: Record<string, unknown>): string {
  const features = request.features as Array<{ featureCode: string; description: string }> ?? [];
  const referenceText = request.referenceText as string ?? "";
  const referenceId = request.referenceId as string ?? "";
  const claimNumber = request.claimNumber as number ?? 1;
  const caseId = request.caseId as string ?? "";
  const specExcerpt = truncate(referenceText, 8000);

  const parts = [
    `你是一名专利复审辅助系统，负责在复审阶段逐特征重新评估新颖性对照。`,
    ``,
    `## 公开状态四档语义`,
    `- clearly-disclosed：对比文件明确公开了该技术特征`,
    `- possibly-disclosed：对比文件可能公开了该技术特征，但需审查员确认`,
    `- not-found：在对比文件中未找到该技术特征的公开内容`,
    `- not-applicable：该特征不适用于本次对照`,
    ``,
    `## 输入数据`,
    `案件 ID: ${caseId}`,
    `权利要求号: ${claimNumber}`,
    `技术特征:`,
    ...features.map((f) => `  ${f.featureCode}: ${f.description}`),
    ``,
    `对比文件 ID: ${referenceId}`,
    `对比文件内容:`,
    specExcerpt,
    ``,
    `## 输出要求`,
    `严格按以下 JSON 格式输出：`,
    `{`,
    `  "referenceId": "${referenceId}",`,
    `  "claimNumber": ${claimNumber},`,
    `  "rows": [`,
    `    { "featureCode": "A", "disclosureStatus": "clearly-disclosed|possibly-disclosed|not-found|not-applicable", "citations": [{ "label": "[0005]", "paragraph": "0005", "quote": "引用原文", "confidence": "high|medium|low" }], "mismatchNotes": "差异说明" }`,
    `  ],`,
    `  "differenceFeatureCodes": ["B", "C"],`,
    `  "pendingSearchQuestions": ["待检索问题"],`,
    `  "legalCaution": "以上为候选事实整理，不构成法律结论。"`,
    `}`
  ];
  return parts.join("\n");
}

function buildInventivePrompt(request: Record<string, unknown>): string {
  const features = request.features as Array<{ featureCode: string; description: string }> ?? [];
  const availableReferences = request.availableReferences as Array<{ label: string; referenceId: string; excerpt: string }> ?? [];
  const caseId = request.caseId as string ?? "";
  const claimNumber = request.claimNumber as number ?? 1;
  const closestPriorArtId = request.closestPriorArtId as string | null ?? null;
  const applicantArguments = request.applicantArguments as string | undefined;
  const amendedClaimText = request.amendedClaimText as string | undefined;

  const parts = [
    `你是一名专利复审辅助系统，负责在复审阶段进行创造性三步法分析。`,
    ``,
    `## 复审上下文`,
    `本次分析基于以下复审背景：`,
    `- 审查意见通知书中的驳回理由`,
    `- 申请人的答辩理由（如提供）`,
    `- 申请人修改后的权利要求（如提供）`,
    ``,
    `## 输入数据`,
    `案件 ID: ${caseId}`,
    `权利要求号: ${claimNumber}`,
    `技术特征:`,
    ...features.map((f) => `  ${f.featureCode}: ${f.description}`),
    ``,
    `可用对比文件:`,
    ...availableReferences.map((r) => `  ${r.label} (${r.referenceId}): ${truncate(r.excerpt, 500)}`),
    ``,
    `用户指定最接近现有技术: ${closestPriorArtId ?? "由 AI 推荐"}`
  ];
  if (applicantArguments) {
    parts.push(``, `申请人答辩理由:`, applicantArguments);
  }
  if (amendedClaimText) {
    parts.push(``, `修改后权利要求:`, truncate(amendedClaimText, 4000));
  }
  parts.push(
    ``,
    `## 输出要求`,
    `严格按以下 JSON 格式输出：`,
    `{`,
    `  "claimNumber": ${claimNumber},`,
    `  "closestPriorArtId": "最接近现有技术的 referenceId",`,
    `  "sharedFeatureCodes": ["共有特征"],`,
    `  "distinguishingFeatureCodes": ["区别特征"],`,
    `  "objectiveTechnicalProblem": "客观技术问题",`,
    `  "motivationEvidence": [{ "referenceId": "ID", "label": "标签", "quote": "引文", "confidence": "high|medium|low" }],`,
    `  "candidateAssessment": "possibly-inventive|possibly-lacks-inventiveness|insufficient-evidence",`,
    `  "cautions": ["注意事项"],`,
    `  "examinerResponse": "审查员回应草稿",`,
    `  "legalCaution": "法律风险提示"`,
    `}`,
    ``,
    `注意：`,
    `- closestPriorArtId 必须填写`,
    `- sharedFeatureCodes 和 distinguishingFeatureCodes 并集必须等于所有 features`,
    `- candidateAssessment 只能是 possibly-inventive、possibly-lacks-inventiveness 或 insufficient-evidence`
  );
  return parts.join("\n");
}

function buildDefectPrompt(request: Record<string, unknown>): string {
  const claimText = request.claimText as string ?? "";
  const specificationText = request.specificationText as string ?? "";
  const claimFeatures = request.claimFeatures as Array<{ featureCode: string; description: string }> ?? [];
  const caseId = request.caseId as string ?? "";

  return [
    `你是一位资深专利审查员，擅长识别专利申请文件中的形式缺陷。`,
    `案件 ID: ${caseId}`,
    ``,
    `权利要求文本:`,
    truncate(claimText, 4000),
    ``,
    `说明书文本:`,
    truncate(specificationText, 8000),
    ``,
    `技术特征:`,
    ...claimFeatures.map((f) => `  ${f.featureCode}: ${f.description}`),
    ``,
    `请检测形式缺陷，严格按以下 JSON 格式输出：`,
    `{`,
    `  "defects": [{ "category": "类别", "description": "描述", "location": "位置(可选)", "severity": "error|warning|info", "previouslyRaised": false, "overcomeStatus": "overcome|not-overcome|partially-overcome(可选)" }],`,
    `  "warnings": [],`,
    `  "legalCaution": "AI 辅助检测，需审查员确认"`,
    `}`
  ].join("\n");
}

function buildChatPrompt(request: Record<string, unknown>): string {
  const caseId = request.caseId as string ?? "";
  const moduleScope = request.moduleScope as string ?? "";
  const contextSummary = request.contextSummary as string ?? "";
  const history = request.history as Array<{ role: string; content: string }> ?? [];
  const userMessage = request.userMessage as string ?? "";

  return [
    `案件 ID: ${caseId}`,
    `当前模块: ${moduleScope}`,
    ``,
    `=== 当前模块数据 ===`,
    contextSummary,
    ``,
    `=== 对话历史 ===`,
    ...history.map((m) => `[${m.role}]: ${m.content}`),
    ``,
    `=== 用户消息 ===`,
    userMessage
  ].join("\n");
}

const INTERPRET_TEMPLATES: Record<string, { title: string; instructions: string[] }> = {
  application: {
    title: "专利申请文件解读",
    instructions: [
      "1. 【技术领域】该专利属于哪个技术领域",
      "2. 【核心技术方案】概括发明的技术方案",
      "3. 【主要权利要求】列出独立权利要求的核心技术特征",
      "4. 【关键实施例】概括关键实施例及其技术效果",
      "5. 【创新点分析】该发明相对于现有技术的创新之处",
      "6. 【潜在问题】可能存在的形式或实质性问题"
    ]
  },
  "office-action": {
    title: "审查意见通知书解读",
    instructions: [
      "1. 【通知书基本信息】发文日、通知书编号、审查员姓名（如有）",
      "2. 【审查结论】整体审查结论概述",
      "3. 【驳回理由清单】逐条列出驳回理由及其法律依据",
      "4. 【引用对比文件】列出引用的对比文件及其公开号、公开日",
      "5. 【权利要求对应关系】每项驳回理由涉及的权利要求号",
      "6. 【申请人答复期限】答复截止日期及注意事项"
    ]
  },
  "office-action-response": {
    title: "意见陈述书解读",
    instructions: [
      "1. 【陈述书基本信息】提交日、对应审查意见通知书编号",
      "2. 【答复策略概述】申请人采取的整体答复策略",
      "3. 【权利要求修改情况】是否修改权利要求，修改内容及依据",
      "4. 【争辩要点】逐条回应驳回理由的核心论点",
      "5. 【新增证据或论证】是否有新的技术证据或论证",
      "6. 【未解决问题】审查员可能继续质疑的问题点"
    ]
  }
};

function buildInterpretPrompt(request: Record<string, unknown>): string {
  const documentType = request.documentType as string ?? "application";
  const template = INTERPRET_TEMPLATES[documentType] ?? INTERPRET_TEMPLATES.application;
  const caseId = request.caseId as string ?? "";
  const documentId = request.documentId as string ?? "unknown";
  const fileName = request.fileName as string ?? "未命名文件";
  const documentText = request.documentText as string ?? "";
  const relatedDocuments = request.relatedDocuments as Array<{ fileName: string; documentType: string }> ?? [];
  const relatedStr = relatedDocuments.length
    ? relatedDocuments.map((doc) => `- ${doc.fileName}（${doc.documentType}）`).join("\n")
    : "无";

  return [
    `你是一个专利审查助手。请对以下${template.title}进行深度解读：`,
    "",
    ...template.instructions,
    "",
    "请用中文回答，结构清晰，每个维度用标题分隔。",
    "必须在开头明确写出当前解读文件名。",
    "",
    `案件 ID: ${caseId}`,
    `文件 ID: ${documentId}`,
    `文件名: ${fileName}`,
    "",
    "=== 同案相关文件 ===",
    relatedStr,
    "",
    "=== 文档内容 ===",
    truncate(documentText, 12000)
  ].join("\n");
}

function buildOpinionAnalysisPrompt(request: Record<string, unknown>): string {
  const caseId = request.caseId as string ?? "";
  const documentId = request.documentId as string ?? "";
  const officeActionText = request.officeActionText as string ?? "";

  return [
    `你是一位资深专利审查员，擅长分析审查意见通知书。`,
    `案件 ID: ${caseId}`,
    `文档 ID: ${documentId}`,
    ``,
    `审查意见通知书文本:`,
    truncate(officeActionText, 12000),
    ``,
    `请提取驳回理由和引用文献，严格按以下 JSON 格式输出：`,
    `{`,
    `  "documentId": "${documentId}",`,
    `  "rejectionGrounds": [{ "code": "RG-1", "category": "novelty|inventive|clarity|support|amendment|other", "claimNumbers": [1], "summary": "摘要", "legalBasis": "法律依据", "originalText": "原文" }],`,
    `  "citedReferences": [{ "publicationNumber": "公开号", "rejectionGroundCodes": ["RG-1"], "featureMapping": "特征映射" }],`,
    `  "legalCaution": "AI 分析法律风险提示"`,
    `}`
  ].join("\n");
}

function buildArgumentAnalysisPrompt(request: Record<string, unknown>): string {
  const caseId = request.caseId as string ?? "";
  const rejectionGrounds = request.rejectionGrounds as Array<{ code: string; category: string; summary: string }> ?? [];
  const responseText = request.responseText as string ?? "";
  const amendedClaimsText = request.amendedClaimsText as string | undefined;

  const parts = [
    `你是一位资深专利审查员，擅长分析意见陈述书中的答辩理由。`,
    `案件 ID: ${caseId}`,
    ``,
    `驳回理由清单:`,
    ...rejectionGrounds.map((g) => `  ${g.code} (${g.category}): ${g.summary}`),
    ``,
    `意见陈述书文本:`,
    truncate(responseText, 12000)
  ];
  if (amendedClaimsText) {
    parts.push(``, `修改后权利要求:`, truncate(amendedClaimsText, 4000));
  }
  parts.push(
    ``,
    `请将每条驳回理由与答辩内容映射，严格按 JSON 格式输出：`,
    `{`,
    `  "mappings": [{ "rejectionGroundCode": "RG-1", "applicantArgument": "答辩原文", "argumentSummary": "摘要", "confidence": "high|medium|low", "amendedClaims": [], "newEvidence": "" }],`,
    `  "unmappedGrounds": ["未映射的 code"],`,
    `  "legalCaution": "AI 分析法律风险提示"`,
    `}`
  );
  return parts.join("\n");
}

function buildReexamDraftPrompt(request: Record<string, unknown>): string {
  const caseId = request.caseId as string ?? "";
  const claimNumber = request.claimNumber as number ?? 1;
  const rejectionGrounds = request.rejectionGrounds as Array<{ code: string; category: string; summary: string }> ?? [];
  const argumentMappings = request.argumentMappings as Array<{ rejectionGroundCode: string; argumentSummary: string; confidence: string }> ?? [];
  const noveltyResults = request.noveltyResults as string | undefined;
  const inventiveResults = request.inventiveResults as string | undefined;
  const defectResults = request.defectResults as string | undefined;

  const parts = [
    `你是一位资深专利审查员，负责起草复审意见草稿。`,
    `案件 ID: ${caseId}`,
    `权利要求号: ${claimNumber}`,
    ``,
    `驳回理由清单:`,
    ...rejectionGrounds.map((g) => `  ${g.code} (${g.category}): ${g.summary}`),
    ``,
    `答辩映射:`,
    ...argumentMappings.map((m) => `  ${m.rejectionGroundCode}: ${m.argumentSummary} [${m.confidence}]`)
  ];
  if (noveltyResults) parts.push(``, `新颖性复核:`, truncate(noveltyResults, 4000));
  if (inventiveResults) parts.push(``, `创造性复核:`, truncate(inventiveResults, 4000));
  if (defectResults) parts.push(``, `缺陷复查:`, truncate(defectResults, 2000));
  parts.push(
    ``,
    `请起草复审意见草稿，严格按 JSON 格式输出：`,
    `{`,
    `  "claimNumber": ${claimNumber},`,
    `  "responseItems": [{ "rejectionGroundCode": "RG-1", "category": "类别", "applicantArgumentSummary": "摘要", "examinerResponse": "回应", "conclusion": "argument-accepted|argument-partially-accepted|argument-rejected|needs-further-review", "supportingEvidence": [] }],`,
    `  "overallAssessment": "综合评估",`,
    `  "defectReviewSummary": "缺陷复查总结(可选)",`,
    `  "legalCaution": "法律风险提示"`,
    `}`
  );
  return parts.join("\n");
}

function buildSummaryPrompt(request: Record<string, unknown>): string {
  const caseBaseline = request.caseBaseline as string ?? "";
  const confirmedFeatures = request.confirmedFeatures as string ?? "";
  const reviewedNoveltyComparisons = request.reviewedNoveltyComparisons as string ?? "";
  const inventiveAnalysis = request.inventiveAnalysis as string ?? "";

  return [
    `你是一位资深专利审查员，负责撰写审查意见简述。`,
    `案件基线: ${caseBaseline}`,
    ``,
    `Claim Chart:`,
    truncate(confirmedFeatures, 4000),
    ``,
    `新颖性对照:`,
    truncate(reviewedNoveltyComparisons, 4000),
    ``,
    `创造性分析:`,
    truncate(inventiveAnalysis, 4000),
    ``,
    `请撰写审查意见简述，严格按 JSON 格式输出：`,
    `{`,
    `  "body": "简述正文",`,
    `  "aiNotes": "AI 备注",`,
    `  "legalCaution": "法律风险提示"`,
    `}`
  ].join("\n");
}

function buildTranslatePrompt(request: Record<string, unknown>): string {
  return truncate(request.documentText as string ?? "", 12000);
}

function buildExtractCaseFieldsPrompt(request: Record<string, unknown>): string {
  const caseId = request.caseId as string ?? "";
  const documents = request.documents as Array<{ fileName: string; text: string }> ?? [];
  const docSections = documents.map((doc, i) => `=== 文件 ${i + 1}: ${doc.fileName} ===\n${doc.text}`);

  return [
    "你是一个专利文档信息提取助手。请从以下专利申请文件中提取案件基本信息和权利要求结构。",
    "",
    "请严格返回 JSON 格式，字段无法确定时设为 null。",
    "",
    JSON.stringify({ title: "string|null", applicationNumber: "string|null", applicant: "string|null", applicationDate: "YYYY-MM-DD|null", priorityDate: "YYYY-MM-DD|null", claims: [{ claimNumber: 1, type: "independent|dependent", dependsOn: [], rawText: "全文" }] }, null, 2),
    "",
    `案件 ID: ${caseId}`,
    "",
    ...docSections
  ].join("\n");
}

function buildClassifyDocumentsPrompt(request: Record<string, unknown>): string {
  const documents = request.documents as Array<{ fileIndex: number; fileName: string; textSample: string }> ?? [];
  const docSections = documents.map((doc) => `=== 文件 ${doc.fileIndex}: ${doc.fileName} ===\n${doc.textSample}`);

  return [
    "你是一个专利文档分类助手。请根据文件名和内容识别每个文件的类型。",
    "",
    "类型：application(申请文件)、office-action(审查意见通知书)、office-action-response(意见陈述书)、reference(对比文件)",
    "",
    "请严格返回 JSON 格式：",
    JSON.stringify({ classifications: [{ fileIndex: 0, fileName: "文件名", role: "application|office-action|office-action-response|reference", confidence: "high|medium|low", reason: "理由" }] }, null, 2),
    "",
    ...docSections
  ].join("\n");
}

// ── 知识库增强 ──────────────────────────────────────────

async function enhanceWithKnowledge(
  prompt: string,
  query: string,
  agentType: string,
  knowledgeEnabled: boolean = false
): Promise<{ prompt: string; citations: Array<{ source: string; score: number; excerpt: string }> }> {
  try {
    // bg-75: 检查用户是否启用了知识库
    if (!knowledgeEnabled) {
      return { prompt, citations: [] };
    }

    // 使用服务端混合检索（直接调用内部函数，避免 HTTP 往返）
    const { hybridSearch } = await import("./hybridSearch.js");
    const { getAllChunks } = await import("./knowledgeDb.js");

    const allChunks = getAllChunks();

    if (allChunks.length === 0) {
      return { prompt, citations: [] };
    }

    const chunkMap = new Map(allChunks.map((c) => [c.id, c]));

    // 纯 BM25 检索（orchestrator 内部不配置 embedding）
    const scores: Array<{ chunkId: string; score: number }> = [];
    const hybridScores = hybridSearch(query, scores, 15);
    const topResults = hybridScores.slice(0, 5);

    if (topResults.length === 0) {
      return { prompt, citations: [] };
    }

    const contextPrefix = getAgentContext(agentType);
    const parts = [prompt, "", contextPrefix, ""];

    const citations: Array<{ source: string; score: number; excerpt: string }> = [];
    for (const result of topResults) {
      const chunk = chunkMap.get(result.chunkId);
      if (!chunk) continue;
      let metadata: Record<string, unknown> = {};
      try { metadata = JSON.parse(chunk.metadata) as Record<string, unknown>; } catch { /* malformed metadata */ }
      const source = (metadata.fileName as string) ?? "unknown";
      parts.push(`> 【来源：${source} · 相似度: ${result.score.toFixed(2)}】`);
      for (const line of chunk.text.split("\n").slice(0, 10)) {
        parts.push(`> ${line}`);
      }
      parts.push("");
      citations.push({ source, score: result.score, excerpt: chunk.text.slice(0, 100) });
    }

    return { prompt: parts.join("\n"), citations };
  } catch (err) {
    logger.warn(`Knowledge enhancement failed: ${err}`);
    return { prompt, citations: [] };
  }
}

function getAgentContext(agentType: string): string {
  switch (agentType) {
    case "novelty": return "以下法规段落与新颖性判断相关，请参考：";
    case "inventive": return "以下法规段落与创造性判断相关，请参考：";
    case "claim-chart": return "以下法规段落与权利要求解释相关，请参考：";
    case "opinion-analysis": return "以下法规段落与审查意见解析相关，请参考：";
    case "argument-analysis": return "以下法规段落与答辩理由评估相关，请参考：";
    case "reexam-draft": return "以下法规段落与复审意见草稿相关，请参考：";
    case "defects": return "以下法规段落与形式缺陷检查相关，请参考：";
    default: return "以下段落与当前分析内容相关，请参考：";
  }
}

// ── 编排器主函数 ──────────────────────────────────────────

/** 服务端编排入口：构造 prompt → 知识库增强 → 调用 AI */
export async function runAgent(req: AgentRunRequest): Promise<AgentRunResponse> {
  try {
    // 1. 构造 prompt
    let prompt: string;
    switch (req.agent) {
      case "claim-chart":
        prompt = buildClaimChartPrompt(req.request);
        break;
      case "novelty":
        prompt = buildNoveltyPrompt(req.request);
        break;
      case "inventive":
        prompt = buildInventivePrompt(req.request);
        break;
      case "defects":
        prompt = buildDefectPrompt(req.request);
        break;
      case "chat":
        prompt = buildChatPrompt(req.request);
        break;
      case "interpret":
        prompt = buildInterpretPrompt(req.request);
        break;
      case "opinion-analysis":
        prompt = buildOpinionAnalysisPrompt(req.request);
        break;
      case "argument-analysis":
        prompt = buildArgumentAnalysisPrompt(req.request);
        break;
      case "reexam-draft":
        prompt = buildReexamDraftPrompt(req.request);
        break;
      case "summary":
        prompt = buildSummaryPrompt(req.request);
        break;
      case "translate":
        prompt = buildTranslatePrompt(req.request);
        break;
      case "extract-case-fields":
        prompt = buildExtractCaseFieldsPrompt(req.request);
        break;
      case "classify-documents":
        prompt = buildClassifyDocumentsPrompt(req.request);
        break;
      default:
        return { ok: false, error: { type: "unsupported", message: `Unknown agent: ${req.agent}` } };
    }

    // 2. 知识库增强
    const query = extractQuery(req.agent, req.request);
    const { prompt: enhancedPrompt, citations } = await enhanceWithKnowledge(prompt, query, req.agent, req.knowledgeEnabled);

    // 3. 调用内部 AI Gateway
    const aiResponse = await callInternalGateway({
      agent: req.agent,
      prompt: enhancedPrompt,
      caseId: req.caseId,
      providerPreference: req.providerPreference,
      modelId: req.modelId,
      modelFallbacks: req.modelFallbacks,
      enableModelFallback: req.enableModelFallback,
      providerBaseUrls: req.providerBaseUrls,
      maxTokens: req.maxTokens,
      signal: req.signal,
      apiKey: req.apiKey,
    });

    // B-038: claim-chart 后处理 — 为每个 feature 生成稳定 id 和 source
    const output = aiResponse.output;
    if (req.agent === "claim-chart" && output && typeof output === "object") {
      const data = output as Record<string, unknown>;
      const claimNumber = (req.request.claimNumber as number) ?? 1;
      if (Array.isArray(data.features)) {
        data.features = data.features.map((f: Record<string, unknown>) => ({
          ...f,
          id: `${req.caseId}-chart-${claimNumber}-${f.featureCode}`,
          source: "ai",
        }));
      }
    }

    return {
      ok: true,
      output,
      tokenUsage: aiResponse.tokenUsage,
      attempts: aiResponse.attempts,
      knowledgeCitations: citations,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Orchestrator error: ${message}`);
    return { ok: false, error: { type: "orchestrator", message } };
  }
}

function extractQuery(agent: string, request: Record<string, unknown>): string {
  switch (agent) {
    case "claim-chart":
      return (request.claims as Array<{ rawText: string }> ?? []).map((c) => c.rawText).join(" ") ?? "";
    case "novelty":
    case "inventive":
      return (request.features as Array<{ description: string }> ?? []).map((f) => f.description).join(" ") ?? "";
    case "defects":
      return (request.claimText as string ?? "").slice(0, 200);
    case "interpret":
      return (request.fileName as string ?? "") + " " + (request.documentText as string ?? "").slice(0, 200);
    case "opinion-analysis":
      return (request.officeActionText as string ?? "").slice(0, 200);
    case "argument-analysis":
      return (request.responseText as string ?? "").slice(0, 200);
    case "reexam-draft":
      return request.rejectionGrounds
        ? (request.rejectionGrounds as Array<{ summary: string }>).map((g) => g.summary).join(" ")
        : "";
    case "summary":
      return (request.confirmedFeatures as string ?? "").slice(0, 200);
    case "chat":
      return (request.userMessage as string ?? "");
    case "extract-case-fields":
    case "classify-documents":
      return (request.documents as Array<{ fileName: string }> ?? []).map((d) => d.fileName).join(" ");
    default:
      return "";
  }
}

interface InternalGatewayRequest {
  agent: string;
  prompt: string;
  caseId: string;
  providerPreference?: string[];
  modelId?: string;
  modelFallbacks?: Record<string, string[]>;
  enableModelFallback?: Record<string, boolean>;
  providerBaseUrls?: Record<string, string>;
  maxTokens?: number;
  signal?: AbortSignal;
  apiKey?: string;
}

interface InternalGatewayResponse {
  output: unknown;
  tokenUsage?: { input: number; output: number; total: number };
  attempts?: Array<{ providerId: string; modelId: string; errorCode?: string; duration: number }>;
}

async function callInternalGateway(req: InternalGatewayRequest): Promise<InternalGatewayResponse> {
  const { registry } = await import("../providers/registry.js");
  const { getApiKey } = await import("../security/keyStore.js");

  // 构建 provider → apiKey 映射（请求体 apiKey 优先于 keyStore）
  const providerApiKeys: Record<string, string> = {};
  for (const pid of req.providerPreference ?? []) {
    const key = req.apiKey ?? getApiKey(pid);
    if (key) providerApiKeys[pid] = key;
  }

  const providerOrder = (req.providerPreference ?? []) as Array<"kimi" | "glm" | "minimax" | "mimo" | "deepseek" | "qwen" | "gemini">;

  const chatRequest: ChatRequest = {
    agent: req.agent,
    modelId: req.modelId ?? "",
    prompt: req.prompt,
    apiKey: "",
    maxTokens: req.maxTokens,
    signal: req.signal,
  };

  const result = await registry.runWithFallback(
    providerOrder,
    chatRequest,
    undefined,
    req.modelFallbacks as Record<string, string[]>,
    req.enableModelFallback as Record<string, boolean>,
    req.providerBaseUrls as Record<string, string>,
    providerApiKeys
  );

  return {
    output: result.output,
    tokenUsage: result.tokenUsage,
    attempts: result.attempts,
  };
}
