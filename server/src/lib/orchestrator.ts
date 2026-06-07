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
import { sanitizeText } from "../security/sanitize.js";
import { extractJsonFromText } from "./jsonExtractor.js";

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

// ── 类型定义 ──────────────────────────────────────────

export interface AgentRunRequest {
  agent: string;
  caseId: string;
  request: Record<string, unknown>;
  providerPreference?: string[] | undefined;
  modelId?: string | undefined;
  modelFallbacks?: Record<string, string[]> | undefined;
  enableModelFallback?: Record<string, boolean> | undefined;
  providerBaseUrls?: Record<string, string> | undefined;
  maxTokens?: number | undefined;
  signal?: AbortSignal | undefined;
  /** bg-75: 用户是否启用了知识库 */
  knowledgeEnabled?: boolean | undefined;
  /** 知识库 embedding 配置 */
  knowledgeEmbedding?: { baseUrl: string; apiKey: string; modelId: string } | undefined;
  /** 知识库 reranker 配置 */
  knowledgeReranker?: { baseUrl: string; apiKey: string; modelId: string } | undefined;
  /** B-041: 请求体传入的 API key（测试/外部调用用），优先于 keyStore */
  apiKey?: string | undefined;
}

export interface AgentRunResponse {
  ok: boolean;
  output?: unknown;
  tokenUsage?: { input: number; output: number; total: number } | undefined;
  attempts?: Array<{ providerId: string; ok: boolean; errorCode?: string }> | undefined;
  error?: { type: string; message: string } | undefined;
  knowledgeCitations?: Array<{ source: string; score: number; excerpt: string }> | undefined;
}

// ── Per-agent 请求类型 ──────────────────────────────────

interface ClaimChartRequest {
  claimNumber?: number;
  claimText?: string;
  specificationText?: string;
  claims?: Array<{ rawText: string }>;
}

interface NoveltyRequest {
  features?: Array<{ featureCode: string; description: string }>;
  referenceText?: string;
  referenceId?: string;
  claimNumber?: number;
  caseId?: string;
}

interface InventiveRequest {
  features?: Array<{ featureCode: string; description: string }>;
  availableReferences?: Array<{ label: string; referenceId: string; excerpt: string }>;
  caseId?: string;
  claimNumber?: number;
  closestPriorArtId?: string | null;
  applicantArguments?: string;
  amendedClaimText?: string;
}

interface DefectRequest {
  claimText?: string;
  specificationText?: string;
  claimFeatures?: Array<{ featureCode: string; description: string }>;
  caseId?: string;
}

interface ChatRequestData {
  caseId?: string;
  moduleScope?: string;
  contextSummary?: string;
  history?: Array<{ role: string; content: string }>;
  userMessage?: string;
}

interface InterpretRequest {
  documentType?: string;
  caseId?: string;
  documentId?: string;
  fileName?: string;
  documentText?: string;
  relatedDocuments?: Array<{ fileName: string; documentType: string }>;
}

interface OpinionAnalysisRequest {
  caseId?: string;
  documentId?: string;
  officeActionText?: string;
}

interface ArgumentAnalysisRequest {
  caseId?: string;
  rejectionGrounds?: Array<{ code: string; category: string; summary: string }>;
  responseText?: string;
  amendedClaimsText?: string;
}

interface ReexamDraftRequest {
  caseId?: string;
  claimNumber?: number;
  rejectionGrounds?: Array<{ code: string; category: string; summary: string }>;
  argumentMappings?: Array<{ rejectionGroundCode: string; argumentSummary: string; confidence: string }>;
  noveltyResults?: string;
  inventiveResults?: string;
  defectResults?: string;
}

interface SummaryRequest {
  caseBaseline?: string;
  confirmedFeatures?: string;
  reviewedNoveltyComparisons?: string;
  inventiveAnalysis?: string;
}

interface TranslateRequest {
  documentText?: string;
  targetLang?: string;
}

interface ExtractCaseFieldsRequest {
  caseId?: string;
  documents?: Array<{ fileName: string; text: string }>;
}

interface ClassifyDocumentsRequest {
  documents?: Array<{ fileIndex: number; fileName: string; textSample: string }>;
}

// ── Prompt 构造器 ──────────────────────────────────────

function buildClaimChartPrompt(request: ClaimChartRequest): PromptParts {
  const claimNumber = request.claimNumber ?? 1;
  const claimText = sanitizeText(request.claimText ?? "");
  const specificationText = sanitizeText(request.specificationText ?? "");
  const specExcerpt = specificationText.length > 8000 ? specificationText.slice(0, 8000) : specificationText;

  const system = [
    `你是一位资深专利审查员助理，任务是对权利要求进行技术特征拆解（Claim Chart）。`,
    ``,
    `约束：`,
    `- 只能基于给定的权利要求文本与说明书片段；不得编造段落号或引用。`,
    `- 每个技术特征必须给出可映射到说明书段落号的 specificationCitations；若无法定位，citationStatus 必须为 "needs-review"。`,
    `- 不得输出新颖性/创造性等法律结论。`,
    `- 严格按下方 JSON 格式输出，不要输出 markdown 代码块或任何解释性文字。`,
    ``,
    `请严格输出以下 JSON 格式（字段名必须完全一致，使用双引号）：`,
    `{`,
    `  "claimNumber": <claimNumber>,`,
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

  const user = [
    `权利要求 ${claimNumber} 文本：`,
    claimText,
    ``,
    `说明书片段（含段落号，如有）：`,
    specExcerpt || "（未提供说明书片段）",
  ].join("\n");

  return { system, user };
}

function buildNoveltyPrompt(request: NoveltyRequest): PromptParts {
  const features = request.features ?? [];
  const referenceText = sanitizeText(request.referenceText ?? "");
  const referenceId = sanitizeText(request.referenceId ?? "");
  const claimNumber = request.claimNumber ?? 1;
  const caseId = sanitizeText(request.caseId ?? "");
  const specExcerpt = truncate(referenceText, 8000);

  const system = [
    `你是一名专利复审辅助系统，负责在复审阶段逐特征重新评估新颖性对照。`,
    ``,
    `## 公开状态四档语义`,
    `- clearly-disclosed：对比文件明确公开了该技术特征`,
    `- possibly-disclosed：对比文件可能公开了该技术特征，但需审查员确认`,
    `- not-found：在对比文件中未找到该技术特征的公开内容`,
    `- not-applicable：该特征不适用于本次对照`,
    ``,
    `## 输出要求`,
    `严格按以下 JSON 格式输出：`,
    `{`,
    `  "referenceId": "<referenceId>",`,
    `  "claimNumber": <claimNumber>,`,
    `  "rows": [`,
    `    { "featureCode": "A", "disclosureStatus": "clearly-disclosed|possibly-disclosed|not-found|not-applicable", "citations": [{ "label": "[0005]", "paragraph": "0005", "quote": "引用原文", "confidence": "high|medium|low" }], "mismatchNotes": "差异说明" }`,
    `  ],`,
    `  "differenceFeatureCodes": ["B", "C"],`,
    `  "pendingSearchQuestions": ["待检索问题，最多5条"],`,
    `  "aiPreliminaryConclusions": ["对每个pendingSearchQuestion的初步判断，与pendingSearchQuestions一一对应"],`,
    `  "legalCaution": "以上为候选事实整理，不构成新颖性法律结论。"`,
    `}`,
    ``,
    `## 重要约束`,
    `- 每个 row 必须独立分析：若 disclosureStatus 为 not-found，mismatchNotes 必须说明具体原因（如工艺不同、参数范围不重叠等），不得笼统说"内容为空"`,
    `- pendingSearchQuestions 仅用于提出需要补充检索的具体技术问题，禁止写"对比文件内容为空"——对比文件内容已在上方提供，你必须基于已有内容分析`,
    `- 若对比文件确实缺少某些技术细节，在 mismatchNotes 中说明即可，不需要为此生成 pendingSearchQuestion`,
    `- aiPreliminaryConclusions 必须与 pendingSearchQuestions 等长，每个元素是对对应问题的初步分析结论（基于已有对比文件内容推断），不能留空`,
  ].join("\n");

  const user = [
    `## 输入数据`,
    `案件 ID: ${caseId}`,
    `权利要求号: ${claimNumber}`,
    `技术特征:`,
    ...features.map((f) => `  ${sanitizeText(f.featureCode)}: ${sanitizeText(f.description ?? "")}`),
    ``,
    `对比文件 ID: ${referenceId}`,
    `对比文件内容:`,
    specExcerpt,
  ].join("\n");

  return { system, user };
}

function buildInventivePrompt(request: InventiveRequest): PromptParts {
  const features = request.features ?? [];
  const availableReferences = request.availableReferences ?? [];
  const caseId = sanitizeText(request.caseId ?? "");
  const claimNumber = request.claimNumber ?? 1;
  const closestPriorArtId = request.closestPriorArtId ? sanitizeText(request.closestPriorArtId) : null;
  const applicantArguments = request.applicantArguments ? sanitizeText(request.applicantArguments) : undefined;
  const amendedClaimText = request.amendedClaimText ? sanitizeText(request.amendedClaimText) : undefined;

  const system = [
    `你是一名专利复审辅助系统，负责在复审阶段进行创造性三步法分析。`,
    ``,
    `## 复审上下文`,
    `本次分析基于以下复审背景：`,
    `- 审查意见通知书中的驳回理由`,
    `- 申请人的答辩理由（如提供）`,
    `- 申请人修改后的权利要求（如提供）`,
    ``,
    `## 输出要求`,
    `严格按以下 JSON 格式输出：`,
    `{`,
    `  "claimNumber": <claimNumber>,`,
    `  "closestPriorArtId": "最接近现有技术的 referenceId",`,
    `  "sharedFeatureCodes": ["共有特征"],`,
    `  "distinguishingFeatureCodes": ["区别特征"],`,
    `  "objectiveTechnicalProblem": "客观技术问题",`,
    `  "motivationEvidence": [{ "referenceId": "ID", "label": "标签", "quote": "引文", "confidence": "high|medium|low" }],`,
    `  "candidateAssessment": "possibly-inventive|possibly-lacks-inventiveness|insufficient-evidence|not-analyzed",`,
    `  "cautions": ["注意事项"],`,
    `  "legalCaution": "法律风险提示"`,
    `}`,
    ``,
    `注意：`,
    `- closestPriorArtId 必须填写`,
    `- sharedFeatureCodes 和 distinguishingFeatureCodes 并集必须等于所有 features`,
    `- candidateAssessment 只能是 possibly-inventive、possibly-lacks-inventiveness、insufficient-evidence 或 not-analyzed（信息不足无法判断时使用）`,
  ].join("\n");

  const userParts = [
    `## 输入数据`,
    `案件 ID: ${caseId}`,
    `权利要求号: ${claimNumber}`,
    `技术特征:`,
    ...features.map((f) => `  ${sanitizeText(f.featureCode)}: ${sanitizeText(f.description ?? "")}`),
    ``,
    `可用对比文件:`,
    ...availableReferences.map((r) => `  ${sanitizeText(r.label)} (${sanitizeText(r.referenceId)}): ${truncate(sanitizeText(r.excerpt ?? ""), 500)}`),
    ``,
    `用户指定最接近现有技术: ${closestPriorArtId ?? "由 AI 推荐"}`,
  ];
  if (applicantArguments) {
    userParts.push(``, `申请人答辩理由:`, applicantArguments);
  }
  if (amendedClaimText) {
    userParts.push(``, `修改后权利要求:`, truncate(amendedClaimText, 4000));
  }
  return { system, user: userParts.join("\n") };
}

function buildDefectPrompt(request: DefectRequest): PromptParts {
  const claimText = sanitizeText(request.claimText ?? "");
  const specificationText = sanitizeText(request.specificationText ?? "");
  const claimFeatures = request.claimFeatures ?? [];
  const caseId = sanitizeText(request.caseId ?? "");

  const system = [
    `你是一位资深专利审查员，擅长识别专利申请文件中的形式缺陷。`,
    ``,
    `请检测形式缺陷，严格按以下 JSON 格式输出：`,
    `{`,
    `  "defects": [{ "category": "类别", "description": "描述", "location": "位置(可选)", "severity": "error|warning|info", "previouslyRaised": false, "overcomeStatus": "overcome|not-overcome|partially-overcome(可选)" }],`,
    `  "warnings": [],`,
    `  "legalCaution": "AI 辅助检测，需审查员确认"`,
    `}`,
  ].join("\n");

  const user = [
    `案件 ID: ${caseId}`,
    ``,
    `权利要求文本:`,
    truncate(claimText, 4000),
    ``,
    `说明书文本:`,
    truncate(specificationText, 8000),
    ``,
    `技术特征:`,
    ...claimFeatures.map((f) => `  ${sanitizeText(f.featureCode)}: ${sanitizeText(f.description ?? "")}`),
  ].join("\n");

  return { system, user };
}

function buildChatPrompt(request: ChatRequestData): PromptParts {
  const caseId = sanitizeText(request.caseId ?? "");
  const moduleScope = sanitizeText(request.moduleScope ?? "");
  const contextSummary = sanitizeText(request.contextSummary ?? "");
  const history = (request.history ?? [])
    .map(m => ({ role: m.role, content: sanitizeText(m.content ?? "") }));
  const userMessage = sanitizeText(request.userMessage ?? "");

  const system = [
    `你是一位专利审查助手，根据当前模块数据和对话历史回答用户问题。`,
    ``,
    `## 引用规则（必须遵守）`,
    `- 回答中凡是涉及"参考知识库"中的内容，必须在对应句子末尾标注来源编号 [1] [2] 等`,
    `- 编号对应"参考知识库"中方括号内的序号，如 [1] 对应第一条`,
    `- 示例：根据相关规定 [1]，申请人应当提交复审请求书 [2]，必要时附具证据 [2]`,
    `- 同一内容可被多处引用，同一句子可引用多个来源 [1][3]`,
    `- 仅基于参考知识库中的内容回答时，每句话都应标注引用`,
    `- 如果回答完全不涉及知识库内容，则不需要标注`,
  ].join("\n");

  const user = [
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
    userMessage,
  ].join("\n");

  return { system, user };
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

function buildInterpretPrompt(request: InterpretRequest): PromptParts {
  const documentType = request.documentType ?? "application";
  const fallback = INTERPRET_TEMPLATES["application"];
  if (!fallback) throw new Error("Missing INTERPRET_TEMPLATES.application");
  const template = INTERPRET_TEMPLATES[documentType] ?? fallback;
  const caseId = sanitizeText(request.caseId ?? "");
  const documentId = sanitizeText(request.documentId ?? "unknown");
  const fileName = sanitizeText(request.fileName ?? "未命名文件");
  const documentText = sanitizeText(request.documentText ?? "");
  const relatedDocuments = request.relatedDocuments ?? [];
  const relatedStr = relatedDocuments.length
    ? relatedDocuments.map((doc) => `- ${sanitizeText(doc.fileName)}（${sanitizeText(doc.documentType)}）`).join("\n")
    : "无";

  const system = [
    `你是一个专利审查助手。请对以下${template.title}进行深度解读：`,
    "",
    ...template.instructions,
    "",
    "请用中文回答，结构清晰，每个维度用标题分隔。",
    "必须在开头明确写出当前解读文件名。",
  ].join("\n");

  const user = [
    `案件 ID: ${caseId}`,
    `文件 ID: ${documentId}`,
    `文件名: ${fileName}`,
    "",
    "=== 同案相关文件 ===",
    relatedStr,
    "",
    "=== 文档内容 ===",
    truncate(documentText, 12000),
  ].join("\n");

  return { system, user };
}

function buildOpinionAnalysisPrompt(request: OpinionAnalysisRequest): PromptParts {
  const caseId = sanitizeText(request.caseId ?? "");
  const documentId = sanitizeText(request.documentId ?? "");
  const officeActionText = sanitizeText(request.officeActionText ?? "");

  const system = [
    `你是一位资深专利审查员，擅长分析审查意见通知书。`,
    ``,
    `请提取驳回理由和引用文献，严格按以下 JSON 格式输出：`,
    `{`,
    `  "documentId": "<documentId>",`,
    `  "rejectionGrounds": [{ "code": "RG-1", "category": "novelty|inventive|clarity|support|amendment|other", "claimNumbers": [1], "summary": "摘要", "legalBasis": "法律依据", "originalText": "原文" }],`,
    `  "citedReferences": [{ "publicationNumber": "公开号", "rejectionGroundCodes": ["RG-1"], "featureMapping": "特征映射" }],`,
    `  "legalCaution": "AI 分析法律风险提示"`,
    `}`,
  ].join("\n");

  const user = [
    `案件 ID: ${caseId}`,
    `文档 ID: ${documentId}`,
    ``,
    `审查意见通知书文本:`,
    truncate(officeActionText, 12000),
  ].join("\n");

  return { system, user };
}

function buildArgumentAnalysisPrompt(request: ArgumentAnalysisRequest): PromptParts {
  const caseId = sanitizeText(request.caseId ?? "");
  const rejectionGrounds = request.rejectionGrounds ?? [];
  const responseText = sanitizeText(request.responseText ?? "");
  const amendedClaimsText = request.amendedClaimsText != null ? sanitizeText(request.amendedClaimsText) : undefined;

  const system = [
    `你是一位资深专利审查员，擅长分析意见陈述书中的答辩理由。`,
    ``,
    `请将每条驳回理由与答辩内容映射，严格按 JSON 格式输出：`,
    `{`,
    `  "mappings": [{ "rejectionGroundCode": "RG-1", "applicantArgument": "答辩原文", "argumentSummary": "摘要", "confidence": "high|medium|low", "amendedClaims": [], "newEvidence": "" }],`,
    `  "unmappedGrounds": ["未映射的 code"],`,
    `  "legalCaution": "AI 分析法律风险提示"`,
    `}`,
  ].join("\n");

  const userParts = [
    `案件 ID: ${caseId}`,
    ``,
    `驳回理由清单:`,
    ...rejectionGrounds.map((g) => `  ${sanitizeText(g.code)} (${sanitizeText(g.category)}): ${sanitizeText(g.summary)}`),
    ``,
    `意见陈述书文本:`,
    truncate(responseText, 12000),
  ];
  if (amendedClaimsText) {
    userParts.push(``, `修改后权利要求:`, truncate(amendedClaimsText, 4000));
  }
  return { system, user: userParts.join("\n") };
}

function buildReexamDraftPrompt(request: ReexamDraftRequest): PromptParts {
  const caseId = sanitizeText(request.caseId ?? "");
  const claimNumber = request.claimNumber ?? 1;
  const rejectionGrounds = request.rejectionGrounds ?? [];
  const argumentMappings = request.argumentMappings ?? [];
  const noveltyResults = request.noveltyResults;
  const inventiveResults = request.inventiveResults;
  const defectResults = request.defectResults;

  const system = [
    `你是一位资深专利审查员，负责起草复审意见草稿。`,
    ``,
    `请起草复审意见草稿，严格按 JSON 格式输出：`,
    `{`,
    `  "claimNumber": <claimNumber>,`,
    `  "responseItems": [{ "rejectionGroundCode": "RG-1", "category": "类别", "applicantArgumentSummary": "摘要", "examinerResponse": "回应", "conclusion": "argument-accepted|argument-partially-accepted|argument-rejected|needs-further-review", "supportingEvidence": [] }],`,
    `  "overallAssessment": "综合评估",`,
    `  "defectReviewSummary": "缺陷复查总结(可选)",`,
    `  "legalCaution": "法律风险提示"`,
    `}`,
  ].join("\n");

  const userParts = [
    `案件 ID: ${caseId}`,
    `权利要求号: ${claimNumber}`,
    ``,
    `驳回理由清单:`,
    ...rejectionGrounds.map((g) => `  ${sanitizeText(g.code)} (${sanitizeText(g.category)}): ${sanitizeText(g.summary)}`),
    ``,
    `答辩映射:`,
    ...argumentMappings.map((m) => `  ${sanitizeText(m.rejectionGroundCode)}: ${sanitizeText(m.argumentSummary)} [${sanitizeText(m.confidence)}]`),
  ];
  if (noveltyResults) userParts.push(``, `新颖性复核:`, truncate(noveltyResults, 4000));
  if (inventiveResults) userParts.push(``, `创造性复核:`, truncate(inventiveResults, 4000));
  if (defectResults) userParts.push(``, `缺陷复查:`, truncate(defectResults, 2000));
  return { system, user: userParts.join("\n") };
}

function buildSummaryPrompt(request: SummaryRequest): PromptParts {
  const caseBaseline = sanitizeText(request.caseBaseline ?? "");
  const confirmedFeatures = sanitizeText(request.confirmedFeatures ?? "");
  const reviewedNoveltyComparisons = sanitizeText(request.reviewedNoveltyComparisons ?? "");
  const inventiveAnalysis = sanitizeText(request.inventiveAnalysis ?? "");

  const system = [
    `你是一位资深专利审查员，负责撰写审查意见简述。`,
    ``,
    `请撰写审查意见简述，严格按 JSON 格式输出：`,
    `{`,
    `  "body": "简述正文",`,
    `  "aiNotes": "AI 备注",`,
    `  "legalCaution": "法律风险提示"`,
    `}`,
  ].join("\n");

  const user = [
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
  ].join("\n");

  return { system, user };
}

function buildTranslatePrompt(request: TranslateRequest): PromptParts {
  const documentText = sanitizeText(request.documentText ?? "");
  const targetLang = sanitizeText(request.targetLang ?? "中文");

  const system = [
    `你是一名专利文献翻译专家，负责将外文专利文档忠实翻译为${targetLang}。`,
    ``,
    `## 硬约束`,
    `1. **忠实翻译**：严格忠实于原文，不添加、不删减、不改写技术内容。`,
    `2. **保留结构**：保留原文的段落编号（如 [0001]、[0002]）、章节标题和列表结构。`,
    `3. **术语一致性**：同一技术术语在全文中保持翻译一致。`,
    `4. **不确定术语标注**：对不确定的术语翻译，在译文后用括号标注原文，如"导热界面层（thermal interface layer）"。`,
    `5. **专利格式保留**：保留权利要求编号、附图标记（如 (1)、(2)）等专利特有格式。`,
    ``,
    `## 输出`,
    `直接输出${targetLang}翻译文本，保留原文的段落结构和编号。`,
  ].join("\n");

  const user = [
    `## 输入文档`,
    ``,
    truncate(documentText, 12000),
  ].join("\n");

  return { system, user };
}

function buildExtractCaseFieldsPrompt(request: ExtractCaseFieldsRequest): PromptParts {
  const caseId = sanitizeText(request.caseId ?? "");
  const documents = request.documents ?? [];
  const docSections = documents.map((doc, i) => `=== 文件 ${i + 1}: ${sanitizeText(doc.fileName)} ===\n${sanitizeText(doc.text)}`);

  const system = [
    "你是一个专利文档信息提取助手。请从以下专利申请文件中提取案件基本信息和权利要求结构。",
    "",
    "请严格返回 JSON 格式，字段无法确定时设为 null。",
    "",
    JSON.stringify({ title: "string|null", applicationNumber: "string|null", applicant: "string|null", applicationDate: "YYYY-MM-DD|null", priorityDate: "YYYY-MM-DD|null", claims: [{ claimNumber: 1, type: "independent|dependent", dependsOn: [], rawText: "全文" }] }, null, 2),
  ].join("\n");

  const user = [
    `案件 ID: ${caseId}`,
    "",
    ...docSections,
  ].join("\n");

  return { system, user };
}

function buildClassifyDocumentsPrompt(request: ClassifyDocumentsRequest): PromptParts {
  const documents = request.documents ?? [];
  const docSections = documents.map((doc) => `=== 文件 ${doc.fileIndex}: ${sanitizeText(doc.fileName)} ===\n${sanitizeText(doc.textSample)}`);

  const system = [
    "你是一个专利文档分类助手。请根据文件名和内容识别每个文件的类型。",
    "",
    "类型：application(申请文件)、office-action(审查意见通知书)、office-action-response(意见陈述书)、reference(对比文件)",
    "",
    "请严格返回 JSON 格式：",
    JSON.stringify({ classifications: [{ fileIndex: 0, fileName: "文件名", role: "application|office-action|office-action-response|reference", confidence: "high|medium|low", reason: "理由" }] }, null, 2),
  ].join("\n");

  const user = docSections.join("\n");

  return { system, user };
}

// ── 知识库增强 ──────────────────────────────────────────

async function enhanceWithKnowledge(
  prompt: string,
  query: string,
  agentType: string,
  knowledgeEnabled: boolean = false,
  embeddingConfig?: { baseUrl: string; apiKey: string; modelId: string },
  rerankerConfig?: { baseUrl: string; apiKey: string; modelId: string }
): Promise<{ prompt: string; citations: Array<{ source: string; score: number; excerpt: string }> }> {
  try {
    if (!knowledgeEnabled) {
      logger.info("[RAG] knowledgeEnabled=false, 跳过知识库增强");
      return { prompt, citations: [] };
    }
    logger.info(`[RAG] === 知识库增强开始 === agent=${agentType}, query="${query}"`);

    const { hybridSearch, mmrDiversityRank } = await import("./hybridSearch.js");
    const { getAllChunks, getAllVectors, getChunksWithParent } = await import("./knowledgeDb.js");
    const { expandQueryFull, generateMultiQueries } = await import("./queryExpand.js");

    const allChunks = getAllChunks();
    const allVectors = getAllVectors();
    logger.info(`[RAG] 加载 ${allChunks.length} chunks, ${allVectors.length} vectors`);

    if (allChunks.length === 0) {
      logger.info("[RAG] 知识库为空，跳过");
      return { prompt, citations: [] };
    }

    const chunkMap = new Map(allChunks.map((c) => [c.id, c]));
    const vectorMap = new Map(allVectors.map((v) => [v.chunkId, v]));

    // Step 1: Query Expansion
    logger.info(`[RAG] [Step 1] 开始 query expansion...`);
    const expandedQuery = expandQueryFull(query);
    logger.info(`[RAG] [Step 1] Query expansion: "${query}" → "${expandedQuery}"`);

    // Step 2: Embedding Search（动态 threshold：top-K + 相对 threshold）
    const vectorScores: Array<{ chunkId: string; score: number }> = [];
    if (embeddingConfig) {
      try {
        logger.info(`[RAG] [Step 2] 开始 embedding search, model=${embeddingConfig.modelId}, baseUrl=${embeddingConfig.baseUrl}`);
        const { createRemoteEmbedder } = await import("../routes/knowledge.js");
        const emb = createRemoteEmbedder(embeddingConfig);
        logger.info(`[RAG] [Step 2] Embedding query: model=${emb.modelId}, vectorMap=${vectorMap.size} vectors`);
        const qVec = (await emb.embed([expandedQuery]))[0];
        if (qVec) {
          const allScores: Array<{ chunkId: string; score: number }> = [];
          for (const [chunkId, vec] of vectorMap) {
            let dot = 0, normA = 0, normB = 0;
            for (let i = 0; i < qVec.length; i++) {
              dot += (qVec[i] ?? 0) * (vec.vector[i] ?? 0);
              normA += (qVec[i] ?? 0) * (qVec[i] ?? 0);
              normB += (vec.vector[i] ?? 0) * (vec.vector[i] ?? 0);
            }
            const score = dot / (Math.sqrt(normA) * Math.sqrt(normB));
            allScores.push({ chunkId, score });
          }
          allScores.sort((a, b) => b.score - a.score);

          // 动态 threshold：取 top-K，然后用相对 threshold 过滤低质量结果
          const TOP_K = 15;
          const RELATIVE_THRESHOLD = 0.7; // 相对于最高分
          const topScore = allScores[0]?.score ?? 0;
          const minScore = topScore * RELATIVE_THRESHOLD;
          const filtered = allScores
            .filter((s) => s.score >= minScore && s.score >= 0.1) // 绝对最低 0.1
            .slice(0, TOP_K);
          vectorScores.push(...filtered);
          logger.info(`[RAG] [Step 2] Vector search: ${allScores.length} 全部 → ${vectorScores.length} 结果 (dynamic threshold, top=${topScore.toFixed(4)}, min=${minScore.toFixed(4)})`);
        }
      } catch (embErr) {
        logger.warn(`[RAG] [Step 2] Embedding 失败，降级到纯 BM25: ${embErr}`);
      }
    } else {
      logger.info("[RAG] [Step 2] 未配置 embedding，跳过向量搜索");
    }

    // Step 3: BM25 + Hybrid RRF（Multi-Query 模式）
    const multiQueries = generateMultiQueries(expandedQuery);
    logger.info(`[RAG] [Step 3] Multi-Query: ${multiQueries.length} 个子查询`);

    // 对每个子查询执行混合检索，合并结果（RRF 融合多个查询的结果）
    const allHybridScores: Array<{ chunkId: string; score: number }> = [];
    for (const subQuery of multiQueries) {
      const subResults = hybridSearch(subQuery, vectorScores, 10);
      allHybridScores.push(...subResults);
    }

    // 合并去重：同一 chunk 取最高分
    const mergedScores = new Map<string, number>();
    for (const s of allHybridScores) {
      const existing = mergedScores.get(s.chunkId);
      if (existing === undefined || s.score > existing) {
        mergedScores.set(s.chunkId, s.score);
      }
    }
    const hybridScores = [...mergedScores.entries()]
      .map(([chunkId, score]) => ({ chunkId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);
    logger.info(`[RAG] [Step 3] Multi-Query 合并: ${allHybridScores.length} → ${hybridScores.length} 候选结果`);

    // Step 4: Reranking
    const topCandidates = hybridScores.slice(0, 10);
    let rerankedScores = topCandidates;

    if (rerankerConfig) {
      try {
        const rerankUrl = rerankerConfig.baseUrl.endsWith("/v1")
          ? `${rerankerConfig.baseUrl}/rerank`
          : `${rerankerConfig.baseUrl}/v1/rerank`;
        const documents = topCandidates.map((s) => chunkMap.get(s.chunkId)?.text ?? "");
        logger.info(`[RAG] [Step 4] 远程 Rerank: ${topCandidates.length} 候选, model=${rerankerConfig.modelId}`);
        const rerankRes = await fetch(rerankUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${rerankerConfig.apiKey}` },
          body: JSON.stringify({ model: rerankerConfig.modelId, query: expandedQuery, documents, top_n: 5 }),
          signal: AbortSignal.timeout(30000),
        });
        if (rerankRes.ok) {
          const rerankData = await rerankRes.json() as { results: Array<{ index: number; relevance_score: number }> };
          rerankedScores = rerankData.results
            .filter((r) => r.index >= 0 && r.index < topCandidates.length)
            .map((r) => ({ chunkId: topCandidates[r.index]?.chunkId ?? "", score: r.relevance_score }))
            .filter((r) => r.chunkId !== "");
          logger.info(`[RAG] [Step 4] Rerank 完成: ${rerankedScores.length} 结果, top=${rerankedScores[0]?.score?.toFixed(4) ?? "N/A"}`);
        } else {
          logger.warn(`[RAG] [Step 4] Rerank 失败 (${rerankRes.status})，使用原始排序`);
        }
      } catch (rerankErr) {
        logger.warn(`[RAG] [Step 4] Rerank 错误，使用原始排序: ${rerankErr}`);
      }
    } else {
      const { localRerank } = await import("./reranker.js");
      const candidatesForRerank = topCandidates.map((s) => {
        const chunk = chunkMap.get(s.chunkId);
        if (!chunk) return null;
        return { chunkId: s.chunkId, text: chunk.text, metadata: (() => { try { return JSON.parse(chunk.metadata) as Record<string, unknown>; } catch { return {}; } })(), score: s.score };
      }).filter((c): c is NonNullable<typeof c> => c !== null);
      logger.info(`[RAG] [Step 4] Local Rerank: ${candidatesForRerank.length} 候选`);
      const reranked = localRerank(candidatesForRerank, expandedQuery);
      rerankedScores = reranked;
      logger.info(`[RAG] [Step 4] Rerank 完成: ${reranked.length} 结果, top=${reranked[0]?.score?.toFixed(4) ?? "N/A"}`);
    }

    // Step 4.5: MMR 多样性排序（避免返回过于相似的结果）
    const chunkTextMap = new Map(allChunks.map(c => [c.id, c.text]));
    const diverseResults = mmrDiversityRank(rerankedScores, chunkTextMap, 0.7, 5);
    logger.info(`[RAG] [Step 4.5] MMR 多样性排序: ${rerankedScores.length} → ${diverseResults.length} 结果`);

    // Step 5: Build citations（Parent-Child 模式：检索用 child，注入用 parent）
    const topResults = diverseResults;
    if (topResults.length === 0) {
      logger.info("[RAG] 无结果，跳过增强");
      return { prompt, citations: [] };
    }

    // 获取 parent chunk 文本（如果有 parent 则注入 parent 完整上下文）
    const topChunkIds = topResults.map(r => r.chunkId);
    const chunksWithParent = getChunksWithParent(topChunkIds);

    const contextPrefix = getAgentContext(agentType);
    const parts = [prompt, "", `## 参考知识库`, contextPrefix, `以下法规段落与当前分析相关（${topResults.length}条）：`, ""];
    const citations: Array<{ source: string; score: number; excerpt: string }> = [];

    logger.info(`[RAG] [Step 5] 构建 ${topResults.length} 条 citations（Parent-Child 模式）...`);
    for (let i = 0; i < topResults.length; i++) {
      const result = topResults[i];
      if (!result) continue;
      const chunk = chunkMap.get(result.chunkId);
      if (!chunk) continue;
      let metadata: Record<string, unknown> = {};
      try { metadata = JSON.parse(chunk.metadata) as Record<string, unknown>; } catch { logger.warn("[RAG] Malformed chunk metadata", { chunkId: chunk.id }); }
      const source = typeof metadata.fileName === "string" ? metadata.fileName : "unknown";
      const category = typeof metadata.documentCategory === "string" ? metadata.documentCategory : "未知";
      const article = typeof metadata.article === "string" ? metadata.article : "";
      logger.info(`[RAG]   #${i + 1}: source="${source}" category="${category}" score=${result.score.toFixed(4)} article="${article}"`);

      // Parent-Child 模式：注入 parent 完整文本（保留完整上下文）
      const parentInfo = chunksWithParent.get(result.chunkId);
      const injectText = parentInfo?.parentText ?? chunk.text;

      // 结构化注入格式（编号与引用规则一致：[1] [2] ...）
      const sourceLabel = article ? `《${source}》${article}` : `《${source}》`;
      parts.push(`[${i + 1}] ${sourceLabel}（相似度: ${result.score.toFixed(2)}）`);
      for (const line of injectText.split("\n").slice(0, 15)) parts.push(line);
      parts.push("");
      citations.push({ source, score: result.score, excerpt: injectText.slice(0, 200) });
    }

    logger.info(`[RAG] === 检索完成 === ${citations.length} 条引用注入 prompt`);
    return { prompt: parts.join("\n"), citations };
  } catch (err) {
    logger.warn(`[RAG] Knowledge enhancement failed: ${err}`);
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
    // 1. 构造 prompt（system + user 分离）
    let promptParts: PromptParts;
    switch (req.agent) {
      case "claim-chart":
        promptParts = buildClaimChartPrompt(req.request);
        break;
      case "novelty":
        promptParts = buildNoveltyPrompt(req.request);
        break;
      case "inventive":
        promptParts = buildInventivePrompt(req.request);
        break;
      case "defects":
        promptParts = buildDefectPrompt(req.request);
        break;
      case "chat":
        promptParts = buildChatPrompt(req.request);
        break;
      case "interpret":
        promptParts = buildInterpretPrompt(req.request);
        break;
      case "opinion-analysis":
        promptParts = buildOpinionAnalysisPrompt(req.request);
        break;
      case "argument-analysis":
        promptParts = buildArgumentAnalysisPrompt(req.request);
        break;
      case "reexam-draft":
        promptParts = buildReexamDraftPrompt(req.request);
        break;
      case "summary":
        promptParts = buildSummaryPrompt(req.request);
        break;
      case "translate":
        promptParts = buildTranslatePrompt(req.request);
        break;
      case "extract-case-fields":
        promptParts = buildExtractCaseFieldsPrompt(req.request);
        break;
      case "classify-documents":
        promptParts = buildClassifyDocumentsPrompt(req.request);
        break;
      default:
        return { ok: false, error: { type: "unsupported", message: `Unknown agent: ${req.agent}` } };
    }

    // 2. 知识库增强（知识上下文注入 user prompt）
    // 某些 agent 不需要 RAG（查询无意义、纯文本处理、或 prompt 已包含完整规则）
    const SKIP_RAG_AGENTS = new Set(["classify-documents", "extract-case-fields", "translate", "summary", "defects", "claim-chart"]);
    const shouldUseRag = req.knowledgeEnabled && !SKIP_RAG_AGENTS.has(req.agent);
    const query = extractQuery(req.agent, req.request);
    logger.info(`[Orchestrator] agent=${req.agent}, 提取检索 query="${query.slice(0, 80)}${query.length > 80 ? "..." : ""}", knowledgeEnabled=${req.knowledgeEnabled}, shouldUseRag=${shouldUseRag}`);
    const { prompt: enhancedUserPrompt, citations } = shouldUseRag
      ? await enhanceWithKnowledge(promptParts.user, query, req.agent, true, req.knowledgeEmbedding, req.knowledgeReranker)
      : { prompt: promptParts.user, citations: [] };

    // 2.5 检查 API key 可用性
    const { getApiKey } = await import("../security/keyStore.js");
    const hasAnyKey = req.providerPreference?.some((p) => req.apiKey || getApiKey(p));
    if (!hasAnyKey) {
      return {
        ok: false,
        error: {
          type: "auth",
          message: "未配置任何 AI Provider 的 API Key。请在设置页面中配置 API Key 后重试。",
        },
      };
    }

    // 3. 调用内部 AI Gateway
    // 简单任务的 maxTokens 上限（防止推理模型过度思考）
    const SIMPLE_AGENT_MAX_TOKENS: Record<string, number> = {
      "classify-documents": 1024,  // ×4 推理倍数后 = 4096，足够分类 JSON
      "extract-case-fields": 2048,
    };
    const agentMaxCap = SIMPLE_AGENT_MAX_TOKENS[req.agent];
    const effectiveMaxTokens = agentMaxCap
      ? Math.min(req.maxTokens ?? agentMaxCap, agentMaxCap)  // 取更小值
      : req.maxTokens;

    // 复杂推理 agent 需要更长超时（MiMo reasoning tokens 耗时）
    const HEAVY_AGENT_TIMEOUT_MS = 180_000;
    const HEAVY_AGENTS = new Set(["inventive", "novelty", "defects", "claim-chart", "opinion-analysis", "argument-analysis"]);
    const agentTimeoutMs = HEAVY_AGENTS.has(req.agent) ? HEAVY_AGENT_TIMEOUT_MS : undefined;

    logger.info(`[Orchestrator] 发送 AI 请求: system=${promptParts.system.length} 字符, user=${enhancedUserPrompt.length} 字符, ${citations.length} 条知识引用已注入`);
    const aiResponse = await callInternalGateway({
      agent: req.agent,
      systemPrompt: promptParts.system,
      userPrompt: enhancedUserPrompt,
      caseId: req.caseId,
      providerPreference: req.providerPreference,
      modelId: req.modelId,
      modelFallbacks: req.modelFallbacks,
      enableModelFallback: req.enableModelFallback,
      providerBaseUrls: req.providerBaseUrls,
      maxTokens: effectiveMaxTokens,
      signal: req.signal,
      apiKey: req.apiKey,
      timeoutMs: agentTimeoutMs,
    });

    // 解析 AI 返回的 JSON
    let output: unknown = aiResponse.output;
    if (typeof output === "string") {
      logger.info(`[Orchestrator] agent=${req.agent}, raw output length=${output.length}, first 1000 chars:\n${output.slice(0, 1000)}`);
      const extracted = extractJsonFromText(output);
      if (extracted) {
        logger.info(`[Orchestrator] JSON extracted successfully, parsed keys: ${Object.keys(extracted.parsed as object).join(", ")}`);
        output = extracted.parsed;
      } else if (req.agent === "chat" || req.agent === "interpret") {
        // chat/interpret agent 返回纯文本，包装为 { reply } 格式
        output = { reply: output };
      } else {
        logger.warn(`[Orchestrator] Failed to extract JSON from agent=${req.agent} output, full content:\n${output}`);
      }
    }

    // novelty agent: 记录 pendingSearchQuestions 便于调试
    if (req.agent === "novelty" && output && typeof output === "object") {
      const data = output as Record<string, unknown>;
      const rows = data.rows as Array<Record<string, unknown>> | undefined;
      logger.info(`[Novelty] rows=${rows?.length ?? 0}, pendingSearchQuestions=${JSON.stringify(data.pendingSearchQuestions)?.slice(0, 300)}`);
    }

    // B-038: claim-chart 后处理 — 为每个 feature 生成稳定 id 和 source
    // (output is now parsed object or original string)
    if (req.agent === "claim-chart" && output && typeof output === "object") {
      const data = output as Record<string, unknown>;
      const chartReq = req.request as ClaimChartRequest;
      const claimNumber = chartReq.claimNumber ?? 1;
      if (Array.isArray(data.features) && data.features.length > 0) {
        data.features = data.features.map((f: Record<string, unknown>) => ({
          ...f,
          id: `${req.caseId}-chart-${claimNumber}-${f.featureCode}`,
          caseId: req.caseId,
          claimNumber,
          source: "ai",
        }));
      } else {
        // features 缺失或为空数组 — LLM 未生成有效特征
        const keys = Object.keys(data);
        logger.warn(`[Orchestrator] claim-chart 输出缺少 features，parsed keys: [${keys.join(", ")}], raw output:\n${JSON.stringify(data).slice(0, 500)}`);
        return {
          ok: false,
          error: {
            type: "ai-output",
            message: "AI 未返回有效的权利要求特征。请检查权利要求文本是否完整，或尝试重新运行。",
          },
          tokenUsage: aiResponse.tokenUsage,
          attempts: aiResponse.attempts,
        };
      }
    } else if (req.agent === "claim-chart" && typeof output === "string") {
      // JSON 提取失败，output 仍为原始字符串
      logger.warn(`[Orchestrator] claim-chart JSON 提取失败，raw output:\n${output.slice(0, 500)}`);
      return {
        ok: false,
        error: {
          type: "ai-output",
          message: "AI 未返回有效的 JSON 格式。请检查权利要求文本是否完整，或尝试重新运行。",
        },
        tokenUsage: aiResponse.tokenUsage,
        attempts: aiResponse.attempts,
      };
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
    const stack = err instanceof Error ? err.stack : undefined;
    logger.error(`Orchestrator error: ${message}${stack ? `\n${stack}` : ""}`);
    return { ok: false, error: { type: "orchestrator", message } };
  }
}

function extractQuery(agent: string, request: Record<string, unknown>): string {
  switch (agent) {
    case "claim-chart": {
      const r = request as ClaimChartRequest;
      // 兼容两种格式：claims 数组或单个 claimText
      if (r.claims && r.claims.length > 0) {
        return r.claims.map((c) => c.rawText).join(" ");
      }
      return (r.claimText ?? "").slice(0, 200);
    }
    case "novelty":
    case "inventive": {
      const r = request as NoveltyRequest;
      return (r.features ?? []).map((f) => f.description).join(" ");
    }
    case "defects": {
      const r = request as DefectRequest;
      return (r.claimText ?? "").slice(0, 200);
    }
    case "interpret": {
      const r = request as InterpretRequest;
      return (r.fileName ?? "") + " " + (r.documentText ?? "").slice(0, 200);
    }
    case "opinion-analysis": {
      const r = request as OpinionAnalysisRequest;
      return (r.officeActionText ?? "").slice(0, 200);
    }
    case "argument-analysis": {
      const r = request as ArgumentAnalysisRequest;
      return (r.responseText ?? "").slice(0, 200);
    }
    case "reexam-draft": {
      const r = request as ReexamDraftRequest;
      return r.rejectionGrounds
        ? r.rejectionGrounds.map((g) => g.summary).join(" ")
        : "";
    }
    case "summary": {
      const r = request as SummaryRequest;
      return (r.confirmedFeatures ?? "").slice(0, 200);
    }
    case "chat": {
      const r = request as ChatRequestData;
      return r.userMessage ?? "";
    }
    case "extract-case-fields":
    case "classify-documents": {
      const r = request as ExtractCaseFieldsRequest;
      return (r.documents ?? []).map((d) => d.fileName).join(" ");
    }
    case "translate":
      // 翻译 agent 不需要知识库增强 — 源文本就是输入，无需检索相关内容
      return "";
    default:
      return "";
  }
}

interface PromptParts {
  system: string;
  user: string;
}

interface InternalGatewayRequest {
  agent: string;
  systemPrompt: string;
  userPrompt: string;
  caseId: string;
  providerPreference?: string[] | undefined;
  modelId?: string | undefined;
  modelFallbacks?: Record<string, string[]> | undefined;
  enableModelFallback?: Record<string, boolean> | undefined;
  providerBaseUrls?: Record<string, string> | undefined;
  maxTokens?: number | undefined;
  signal?: AbortSignal | undefined;
  apiKey?: string | undefined;
  timeoutMs?: number | undefined;
}

interface InternalGatewayResponse {
  output: unknown;
  tokenUsage?: { input: number; output: number; total: number } | undefined;
  attempts?: Array<{ providerId: string; ok: boolean; errorCode?: string }> | undefined;
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

  const providerOrder = req.providerPreference ?? [];
  logger.info(`[Gateway] providerOrder=[${providerOrder.join(", ")}], hasApiKeys=[${Object.keys(providerApiKeys).join(", ")}], modelId=${req.modelId}`);

  const chatRequest: ChatRequest = {
    modelId: req.modelId ?? "",
    messages: [
      { role: "system", content: req.systemPrompt },
      { role: "user", content: req.userPrompt },
    ],
    apiKey: "",
    ...(req.maxTokens !== undefined && { maxTokens: req.maxTokens }),
    ...(req.signal !== undefined && { signal: req.signal }),
    ...(req.timeoutMs !== undefined && { timeoutMs: req.timeoutMs }),
  };

  const result = await registry.runWithFallback(
    providerOrder,
    chatRequest,
    undefined,
    req.modelFallbacks,
    req.enableModelFallback,
    req.providerBaseUrls,
    providerApiKeys
  );

  if (result.response.error) {
    logger.warn(`[Gateway] LLM 调用失败: code=${result.response.error.code}, message=${result.response.error.message}, attempts=${result.attempts.map(a => `${a.providerId}(${a.errorCode ?? "ok"})`).join(", ")}`);
  } else {
    logger.info(`[Gateway] LLM 调用成功: ${result.response.text.length} chars, attempts=${result.attempts.map(a => `${a.providerId}(${a.errorCode ?? "ok"})`).join(", ")}`);
  }

  return {
    output: result.response.text,
    tokenUsage: result.response.tokenUsage,
    attempts: result.attempts,
  };
}
