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
  "載": "载", "達": "达", "銷": "销", "鏈": "链", "閱": "阅", "雲": "云",
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
