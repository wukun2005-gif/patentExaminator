/**
 * E2E 测试样本数据
 * ================
 *
 * 集中管理所有 E2E 测试使用的样本数据，避免重复定义。
 */

// ── LED 散热器案例 (G1) ─────────────────────────────────────────────

/** G1 权利要求文本 */
export const SAMPLE_CLAIM_G1 = [
  "权利要求1：一种LED灯具用复合散热装置，其特征在于，包括：",
  "散热基板(A)，由铝合金材料制成，表面设有均匀分布的散热翅片；",
  "导热界面层(B)，设置在散热基板与LED芯片之间，为石墨烯复合导热膜，厚度0.1mm-0.5mm；",
  "风冷模块(C)，与散热翅片配合，包含离心风扇及导风罩。",
  "",
  "权利要求2：根据权利要求1所述的复合散热装置，其特征在于，所述散热翅片的间距为2-5mm，高度为10-30mm。",
  "",
  "权利要求3：根据权利要求1所述的复合散热装置，其特征在于，所述石墨烯复合导热膜包含5-15wt%的石墨烯和85-95wt%的有机硅树脂。",
  "",
  "权利要求4：根据权利要求1所述的复合散热装置，其特征在于，所述离心风扇转速为2000-8000rpm，风量为10-50CFM。",
].join("\n");

/** G1 说明书文本 */
export const SAMPLE_SPEC_G1 = [
  "技术领域：本发明涉及LED照明技术领域，具体涉及一种LED灯具用复合散热装置。",
  "",
  "背景技术：LED灯具在工作过程中会产生大量热量，散热不良会导致光衰、色温漂移及寿命缩短。",
  "传统散热方案多采用单一铝合金散热器配合自然对流，散热效率有限。",
  "",
  "发明内容：本发明提供一种LED灯具用复合散热装置，通过铝合金散热基板、石墨烯导热膜及离心风扇三者协同，大幅提升散热效率。",
  "其中，散热基板由6063-T5铝合金一体化压铸成型，表面设有沿径向均匀分布的散热翅片，翅片间距2-5mm、高度10-30mm。",
  "导热界面层为石墨烯复合导热膜，石墨烯含量5-15wt%，厚度0.1mm-0.5mm，导热系数可达800-1500W/(m·K)。",
  "风冷模块包括离心风扇和导风罩，风扇转速2000-8000rpm，风量10-50CFM。",
  "",
  "具体实施方式：如图1所示，LED灯具复合散热装置包括散热基板1、LED芯片2、导热界面层3和风冷模块4。",
  "散热基板1采用6063-T5铝合金通过压铸一体成型，基板上表面集成多个LED芯片2安装位。",
  "导热界面层3设置在散热基板1上表面与LED芯片2之间，采用石墨烯复合导热膜。",
  "风冷模块4安装在散热基板1侧方，包括离心风扇4a和导风罩4b。",
].join("\n");

/** G1 对比文件 D1 */
export const SAMPLE_REF_D1 = [
  "公开号：CN201510012345A",
  "公开日：2015-06-20",
  "标题：一种LED灯具散热结构",
  "",
  "摘要：本发明公开了一种LED灯具散热结构，包括铝合金散热基板，基板上设有散热翅片，",
  "LED芯片通过导热硅脂层安装于基板上表面。散热方式为自然对流。",
  "",
  "主要技术特征：",
  "- 铝合金散热基板+散热翅片（自然对流）",
  "- 导热连接材料：导热硅脂",
  "- 散热方式：被动自然对流",
].join("\n");

/** G1 对比文件 D2 */
export const SAMPLE_REF_D2 = [
  "公开号：US20200123456A1",
  "公开日：2020-05-15",
  "标题：High Efficiency Thermal Management System for LED Arrays",
  "",
  "摘要：A thermal management system using graphene-enhanced thermal interface material",
  "between LED array and aluminum substrate. The TIM comprises 8-12wt% graphene nanoplatelets",
  "dispersed in silicone matrix, achieving thermal conductivity of 600-1200W/(m·K).",
  "",
  "主要技术特征：",
  "- 石墨烯增强导热界面材料",
  "- 硅基基体+8-12wt%石墨烯纳米片",
  "- 导热系数600-1200W/(m·K)",
].join("\n");

/** G1 审查意见通知书 */
export const SAMPLE_OA_G1 = [
  "审查意见通知书",
  "",
  "申请号：CN202310008888A",
  "发明名称：一种LED灯具用复合散热装置",
  "",
  "经审查，本申请存在以下缺陷：",
  "",
  "1. 权利要求1相对于对比文件1（CN201510012345A）不具备新颖性。",
  "   对比文件1公开了铝合金散热基板+散热翅片（特征A），不具备新颖性（专利法第22条第2款）。",
  "",
  "2. 权利要求1-4相对于对比文件1和对比文件2（US20200123456A1）的组合不具备创造性。",
  "   对比文件2公开了石墨烯复合导热膜用于LED散热（特征B），本领域技术人员有动机将其与对比文件1结合（专利法第22条第3款）。",
  "",
  '3. 权利要求1中"离心风扇"的表述不清楚，未限定风扇与散热翅片的具体配合方式（专利法第26条第4款）。',
].join("\n");

/** G1 意见陈述书 */
export const SAMPLE_RESPONSE_G1 = [
  "意见陈述书",
  "",
  "针对审查意见通知书，申请人陈述如下：",
  "",
  "1. 关于新颖性问题：本申请权利要求1的特征A在对比文件1中虽然公开，",
  "   但本申请的散热翅片间距2-5mm、高度10-30mm具有特定技术效果，与对比文件1不同。",
  "   申请人已将此技术特征补入权利要求1。",
  "",
  "2. 关于创造性问题：对比文件2虽然公开了石墨烯导热膜，但其应用于不同技术场景，",
  "   且本申请的石墨烯含量5-15wt%与对比文件2的8-12wt%范围不同，",
  "   本申请通过三者协同实现了超出预期的散热效果（导热系数800-1500W/(m·K)）。",
  "",
  "3. 关于不清楚问题：申请人已在说明书中补充了离心风扇与散热翅片的配合方式描述。",
].join("\n");

/** G1 技术特征列表 */
export const SAMPLE_FEATURES_G1 = [
  { featureCode: "A", description: "铝合金散热基板+散热翅片" },
  { featureCode: "B", description: "石墨烯复合导热膜(0.1-0.5mm)" },
  { featureCode: "C", description: "离心风扇+导风罩" },
];

// ── 锂电池案例 (G2) ─────────────────────────────────────────────────

/** G2 权利要求文本 */
export const SAMPLE_CLAIM_G2 = [
  "权利要求1：一种锂电池用复合正极材料，其特征在于，包括：",
  "正极活性物质(A)，为磷酸铁锂颗粒，粒径D50为1-5μm；",
  "导电剂(B)，为碳纳米管和石墨烯的复合导电网络，添加量为正极活性物质质量的2-5wt%；",
  "粘结剂(C)，为聚偏氟乙烯，添加量为正极活性物质质量的1-3wt%。",
].join("\n");

// ── 传感器案例 (G3) ─────────────────────────────────────────────────

/** G3 权利要求文本 */
export const SAMPLE_CLAIM_G3 = [
  "权利要求1：一种MEMS压力传感器，其特征在于，包括：",
  "硅基底(A)，设有压力敏感膜片；",
  "压阻元件(B)，设置在压力敏感膜片上，为硼掺杂单晶硅；",
  "信号调理电路(C)，与压阻元件连接，集成在硅基底上。",
].join("\n");

// ── Mock 请求构建器 ─────────────────────────────────────────────────

/**
 * 构建 Mock 请求体
 *
 * @param {object} options
 * @param {string} options.agent
 * @param {string} options.caseId
 * @param {string} [options.moduleScope="claim-chart"]
 * @param {object} [options.extra={}]
 * @returns {object}
 */
export function buildMockRequest(options) {
  const { agent, caseId, moduleScope = "claim-chart", extra = {}, webSearchEnabled, groundednessEnabled } = options;

  const metadata = {
    caseId,
    moduleScope,
    tokenEstimate: 0,
  };

  // Novelty 需要特殊的 mockKey 格式
  if (agent === "novelty" && extra.referenceId) {
    metadata.mockKey = `${caseId}:${extra.referenceId}`;
    delete extra.referenceId;
  }

  return {
    agent,
    providerPreference: ["gemini"],
    modelId: "mock",
    prompt: `[Mock E2E test] ${agent} for case ${caseId}`,
    sanitized: false,
    mock: true,
    metadata,
    ...(webSearchEnabled !== undefined && { webSearchEnabled }),
    ...(groundednessEnabled !== undefined && { groundednessEnabled }),
    ...extra,
  };
}

// ── 测试案例 ID ─────────────────────────────────────────────────────

/** 测试案例 ID 映射 */
export const TEST_CASE_IDS = {
  g1: "g1-led",
  g2: "g2-battery",
  g3: "g3-sensor",
};

// ── 测试搜索词 ──────────────────────────────────────────────────────

/** G1 测试搜索词 */
export const SAMPLE_SEARCH_QUERIES_G1 = [
  "LED散热器 相变材料",
  "LED heatsink phase change",
];

/** G1 测试搜索请求体 */
export const SAMPLE_SEARCH_REQUEST_G1 = {
  caseId: TEST_CASE_IDS.g1,
  claimText: "一种LED灯具散热装置，包括：散热基板(A)，铝合金材质，表面有散热翅片；导热界面层(B)，石墨烯复合导热膜，厚度0.1-0.5mm；风冷模块(C)，含离心风扇和导风罩。",
  features: SAMPLE_FEATURES_G1,
  searchQueries: SAMPLE_SEARCH_QUERIES_G1,
  maxResults: 5,
  mock: true,
};
