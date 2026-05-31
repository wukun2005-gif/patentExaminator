/**
 * 知识库文本预处理 — 清洗、规范化、去重、噪声过滤
 */

// ── 文本清洗 ──────────────────────────────────────────

/** 去除页眉页脚、页码、水印等噪声 */
export function cleanText(text: string): string {
  let cleaned = text;

  // 去除常见页眉页脚模式
  cleaned = cleaned.replace(/^第\s*\d+\s*页.*$/gm, ""); // "第 X 页"
  cleaned = cleaned.replace(/^-\s*\d+\s*-$/gm, ""); // "- X -"
  cleaned = cleaned.replace(/^\d+\s*\/\s*\d+$/gm, ""); // "X / Y"
  cleaned = cleaned.replace(/^页码:\s*\d+.*$/gm, ""); // "页码: X"

  // 去除水印
  cleaned = cleaned.replace(/^(仅供|内部|草稿|DRAFT|CONFIDENTIAL).{0,20}$/gim, "");

  // 去除多余空白
  cleaned = cleaned.replace(/[ \t]+/g, " "); // 多个空格/tab 合并为一个
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n"); // 多个换行合并为两个
  cleaned = cleaned.replace(/^\s+$/gm, ""); // 纯空白行清空

  return cleaned.trim();
}

// ── 法条引用规范化 ─────────────────────────────────────

/** 将各种法条引用格式统一为"第X条"格式 */
export function normalizeLegalReference(text: string): string {
  let normalized = text;

  // "§22.3" → "第22条第3款"
  normalized = normalized.replace(/§(\d+)\.(\d+)/g, "第$1条第$2款");
  // "§22" → "第22条"
  normalized = normalized.replace(/§(\d+)/g, "第$1条");
  // "Article 22" → "第22条"
  normalized = normalized.replace(/Article\s+(\d+)/gi, "第$1条");
  // "Art.22" → "第22条"
  normalized = normalized.replace(/Art\.?\s*(\d+)/gi, "第$1条");

  return normalized;
}

// ── 日期规范化 ─────────────────────────────────────────

/** 将各种日期格式统一为 ISO 格式 YYYY-MM-DD */
export function normalizeDate(text: string): string {
  let normalized = text;

  // "2024年1月20日" → "2024-01-20"
  normalized = normalized.replace(
    /(\d{4})年(\d{1,2})月(\d{1,2})日/g,
    (_, y, m, d) => `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
  );
  // "2024.1.20" → "2024-01-20"
  normalized = normalized.replace(
    /(\d{4})\.(\d{1,2})\.(\d{1,2})/g,
    (_, y, m, d) => `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
  );
  // "2024/1/20" → "2024-01-20"
  normalized = normalized.replace(
    /(\d{4})\/(\d{1,2})\/(\d{1,2})/g,
    (_, y, m, d) => `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
  );

  return normalized;
}

// ── 编码统一 ───────────────────────────────────────────

/** 全角转半角 */
export function normalizeWidth(text: string): string {
  return text.replace(/[！-～]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );
}

/** 繁简转换（常用字映射，覆盖专利法律领域常见字） */
const TRADITIONAL_MAP: Record<string, string> = {
  "專": "专", "利": "利", "權": "权", "請": "请", "發": "发", "審": "审",
  "查": "查", "標": "标", "準": "准", "術": "术", "證": "证", "據": "据",
  "議": "议", "論": "论", "題": "题", "實": "实", "義": "义", "務": "务",
  "處": "处", "報": "报", "關": "关", "開": "开", "問": "问", "間": "间",
  "書": "书", "記": "记", "設": "设", "計": "计", "資": "资", "運": "运",
  "過": "过", "達": "达", "進": "进", "選": "选", "還": "还", "適": "适",
  "邊": "边", "釋": "释", "錄": "录", "錯": "错", "應": "应", "變": "变",
  "類": "类", "點": "点", "號": "号", "統": "统", "續": "续", "維": "维",
  "組": "组", "結": "结", "絕": "绝", "總": "总", "經": "经", "網": "网",
  "規": "规", "認": "认", "護": "护", "質": "质", "輸": "输", "轉": "转",
  "載": "载", "銷": "销", "鏈": "链", "閱": "阅", "雲": "云",
  "電": "电", "響": "响", "預": "预", "驗": "验", "體": "体", "優": "优",
};

export function normalizeTraditional(text: string): string {
  return text.replace(/[一-鿿]/g, (ch) => TRADITIONAL_MAP[ch] ?? ch);
}

// ── 统一规范化入口 ─────────────────────────────────────

/** 对提取的文本执行全部规范化步骤 */
export function normalizeText(text: string): string {
  let result = text;
  result = cleanText(result);
  result = normalizeLegalReference(result);
  result = normalizeDate(result);
  result = normalizeWidth(result);
  result = normalizeTraditional(result);
  return result;
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
  if (lower.includes("案例") || lower.includes("决定要点") || head.includes("典型案例")) return "案例";
  if (head.includes("国家知识产权局")) return "部门规章";

  return "其他";
}

// ── 法条-案例关联 ─────────────────────────────────────

/** 从 chunk 文本中提取引用的法条编号 */
export function extractArticleRefs(text: string): string[] {
  const refs = text.match(/第[一二三四五六七八九十百千零\d]+条(?:第[一二三四五六七八九十百千零\d]+款)?/g);
  return [...new Set(refs ?? [])];
}

/** 从 chunk 文本中提取引用的专利号 */
export function extractPatentNumbers(text: string): string[] {
  const patterns = [
    /CN\d{9,12}[A-Z]\d?/g,      // 中国专利号
    /US\d{7,8}[A-Z]\d?/g,       // 美国专利号
    /EP\d{7,8}[A-Z]\d?/g,       // 欧洲专利号
    /WO\d{4}\/\d{6}[A-Z]?\d?/g, // PCT 申请号
  ];
  const numbers: string[] = [];
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) numbers.push(...matches);
  }
  return [...new Set(numbers)];
}

// ── 多语言支持 ─────────────────────────────────────────

/** 检测文本主要语言 */
export function detectLanguage(text: string): "zh" | "en" | "mixed" {
  const zhChars = (text.match(/[一-鿿]/g) ?? []).length;
  const enChars = (text.match(/[a-zA-Z]/g) ?? []).length;
  const total = zhChars + enChars;
  if (total === 0) return "en";
  const zhRatio = zhChars / total;
  if (zhRatio > 0.7) return "zh";
  if (zhRatio < 0.3) return "en";
  return "mixed";
}

/** 中英文术语映射：英文 query 也能匹配中文 chunk */
export const CROSS_LANG_MAP: Record<string, string[]> = {
  "inventive step": ["创造性", "三步法"],
  "novelty": ["新颖性"],
  "claim": ["权利要求"],
  "specification": ["说明书"],
  "prior art": ["现有技术"],
  "closest prior art": ["最接近现有技术"],
  "distinguishing feature": ["区别特征"],
  "technical motivation": ["技术启示"],
  "reexamination": ["复审"],
  "invalidation": ["无效宣告"],
  "unity": ["单一性"],
  "sufficient disclosure": ["充分公开"],
  "added matter": ["修改超范围"],
  "divisional application": ["分案申请"],
  "priority date": ["优先权日"],
};

/** 跨语言 query 扩展 */
export function expandCrossLanguage(query: string): string {
  const lower = query.toLowerCase();
  const expanded = new Set<string>([query]);

  for (const [enTerm, zhTerms] of Object.entries(CROSS_LANG_MAP)) {
    if (lower.includes(enTerm)) {
      for (const zh of zhTerms) expanded.add(zh);
    }
    for (const zh of zhTerms) {
      if (lower.includes(zh)) {
        expanded.add(enTerm);
        for (const otherZh of zhTerms) expanded.add(otherZh);
      }
    }
  }

  return Array.from(expanded).join(" ");
}

// ── 术语标准化映射（同义词表） ─────────────────────────

/** 专利法律领域同义词表：用于 query 扩展和检索增强 */
export const LEGAL_SYNONYMS: Record<string, string[]> = {
  "创造性": ["非显而易见性", "inventive step", "非显而易见", "三步法"],
  "新颖性": ["novelty", "绝对新颖性", "相对新颖性"],
  "实用性": ["工业实用性", "utility", "industrial applicability"],
  "权利要求": ["claim", "权项", "请求保护范围"],
  "说明书": ["specification", "专利说明书"],
  "对比文件": ["reference", "现有技术文献", "prior art"],
  "最接近现有技术": ["closest prior art", "最接近的现有技术"],
  "区别特征": ["distinguishing feature", "区别技术特征"],
  "技术启示": ["technical motivation", "技术动机", "结合启示"],
  "公开": ["disclosed", "公开内容", "技术公开"],
  "充分公开": ["sufficient disclosure", "enablement"],
  "修改超范围": ["added matter", "新事项"],
  "单一性": ["unity of invention", "unity"],
  "分案申请": ["divisional application"],
  "优先权": ["priority", "优先权日", "priority date"],
  "抵触申请": ["conflicting application"],
  "复审": ["reexamination", "复审请求"],
  "无效宣告": ["invalidation", "invalidation request"],
};

/** 对 query 做同义词扩展 */
export function expandQuery(query: string): string {
  const expanded = new Set<string>([query]);
  const lower = query.toLowerCase();

  for (const [term, synonyms] of Object.entries(LEGAL_SYNONYMS)) {
    if (lower.includes(term.toLowerCase()) || synonyms.some((s) => lower.includes(s.toLowerCase()))) {
      expanded.add(term);
      for (const syn of synonyms) {
        expanded.add(syn);
      }
    }
  }

  return Array.from(expanded).join(" ");
}

// ── 安全检查 ───────────────────────────────────────────

/** 检测 chunk 是否包含 prompt injection 攻击模式 */
export function containsPromptInjection(text: string): boolean {
  const patterns = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /忽略.*之前.*指令/i,
    /忽略.*以上.*指令/i,
    /你是一个.*助手.*你必须/i,
    /system\s*:\s*/i,
    /\[INST\]/i,
    /<\|im_start\|>/i,
    /jailbreak/i,
    /DAN\s+mode/i,
  ];
  return patterns.some((p) => p.test(text));
}

/** 检测 chunk 是否包含敏感信息（未公开专利号等） */
export function containsSensitiveInfo(text: string): boolean {
  // 检测明显的未公开标记
  const patterns = [
    /保密专利/i,
    /classified/i,
    /confidential/i,
    /内部文件.*不得外传/i,
  ];
  return patterns.some((p) => p.test(text));
}

// ── Chunk 文本 hash（用于去重） ─────────────────────────

/** 计算 chunk 文本的 SHA-256 hash */
export async function hashChunkText(text: string): Promise<string> {
  const normalized = text.trim().replace(/\s+/g, " "); // 规范化空白后 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
