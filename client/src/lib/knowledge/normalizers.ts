/**
 * 知识库文本预处理 — 噪声过滤、文档分类、查询扩展
 */

/** 计算文本 hash（用于 embedding 缓存） */
export async function hashChunkText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── 噪声过滤 ───────────────────────────────────────────

/** 判断文本是否为纯噪声（全数字、全标点、过短无意义） */
export function isNoise(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  if (/^[\d\s]+$/.test(trimmed)) return true; // 纯数字
  if (/^[^\w一-鿿]+$/.test(trimmed)) return true; // 纯标点（无中英文字符）
  if (trimmed.length < 5 && !/[一-鿿]/.test(trimmed)) return true; // 过短且无中文
  return false;
}

/** 判断文本是否主要为乱码（非中文非英文字符占比过高） */
export function isGarbled(text: string): boolean {
  const meaningful = text.match(/[\w一-鿿]/g);
  const ratio = meaningful ? meaningful.length / text.length : 0;
  return ratio < 0.3; // 有意义字符占比低于 30% 视为乱码
}

// ── 文档类型标注 ───────────────────────────────────────

export type DocumentCategory =
  | "法律"
  | "行政法规"
  | "部门规章"
  | "司法解释"
  | "审查指南"
  | "案例"
  | "其他";

/** 根据文件名和内容推断文档类型 */
export function classifyDocument(fileName: string, text: string): DocumentCategory {
  const lower = fileName.toLowerCase();
  const head = text.slice(0, 500);

  if (lower.includes("审查指南") || head.includes("专利审查指南")) return "审查指南";
  if (lower.includes("司法解释") || head.includes("最高人民法院")) return "司法解释";
  if (lower.includes("专利法实施细则") || head.includes("国务院令")) return "行政法规";
  if (lower.includes("专利法") || head.includes("全国人民代表大会")) return "法律";
  if (lower.includes("案例") || lower.includes("决定要点")) return "案例";
  return "其他";
}

// ── 元数据提取 ─────────────────────────────────────────

/** 提取法条引用 */
export function extractArticleRefs(text: string): string[] {
  const refs = text.match(/第[一二三四五六七八九十百千零\d]+条(?:第[一二三四五六七八九十百千零\d]+款)?/g);
  return [...new Set(refs ?? [])];
}

/** 提取专利号 */
export function extractPatentNumbers(text: string): string[] {
  const patterns = [
    /(?:CN|US|EP|JP|KR)\s*\d{4,12}\s*[A-Z]\d?/gi,
    /\d{4,12}\s*[A-Z]\d?\s*(?:专利|申请)/g,
  ];
  const numbers: string[] = [];
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) numbers.push(...matches);
  }
  return [...new Set(numbers)];
}

// ── 查询扩展 ───────────────────────────────────────────

/** 跨语言扩展：中文关键词 → 英文同义词 */
export const CROSS_LANG_MAP: Record<string, string[]> = {
  "权利要求": ["claim", "claims"],
  "说明书": ["description", "specification"],
  "摘要": ["abstract"],
  "技术方案": ["technical solution", "technical scheme"],
  "技术特征": ["technical feature", "technical features"],
  "发明目的": ["object of the invention", "purpose"],
  "有益效果": ["beneficial effect", "advantageous effect"],
  "背景技术": ["background art", "background technology"],
  "实施方式": ["embodiment", "embodiments"],
  "附图": ["drawing", "drawings", "figures"],
};

/** 跨语言查询扩展 */
export function expandCrossLanguage(query: string): string {
  const expanded: string[] = [query];
  for (const [zh, enList] of Object.entries(CROSS_LANG_MAP)) {
    if (query.includes(zh)) {
      expanded.push(...enList);
    }
  }
  return expanded.join(" ");
}

/** 法律同义词扩展 */
export const LEGAL_SYNONYMS: Record<string, string[]> = {
  "新颖性": ["novelty", "新"],
  "创造性": ["inventive step", "inventiveness", "非显而易见性"],
  "实用性": ["utility", "工业实用性"],
  "充分公开": ["sufficient disclosure", "enablement"],
  "权利要求": ["claim", "claims", "权项"],
  "说明书": ["specification", "description"],
  "修改": ["amendment", "修改"],
  "答复": ["response", "reply"],
};

/** 法律同义词查询扩展 */
export function expandQuery(query: string): string {
  const expanded: string[] = [query];
  for (const [term, synonyms] of Object.entries(LEGAL_SYNONYMS)) {
    if (query.includes(term)) {
      expanded.push(...synonyms);
    }
  }
  return expanded.join(" ");
}

// ── 安全检测 ───────────────────────────────────────────

/** 检测是否包含 Prompt 注入攻击 */
export function containsPromptInjection(text: string): boolean {
  const patterns = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /忽略.*之前.*指令/i,
    /忽略.*上面.*内容/i,
    /ignore.*above/i,
    /system\s*prompt/i,
    /系统.*提示.*词/i,
  ];
  return patterns.some((p) => p.test(text));
}

/** 检测是否包含敏感信息 */
export function containsSensitiveInfo(text: string): boolean {
  const patterns = [
    /\b\d{18}\b/, // 身份证号
    /\b\d{17}[\dXx]\b/, // 身份证号（含 X）
    /\b\d{16,19}\b/, // 银行卡号
    /密码|password|passwd/i,
    /密钥|secret.*key|api.*key/i,
  ];
  return patterns.some((p) => p.test(text));
}
