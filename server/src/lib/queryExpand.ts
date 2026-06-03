/**
 * 查询扩展模块 — 跨语言扩展 + 法律同义词 + 法条图谱扩展
 * bg-71: 从客户端迁移到服务端，统一检索流程
 */

// ── 跨语言扩展 ───────────────────────────────────────────

const CROSS_LANG_MAP: Record<string, string[]> = {
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
function expandCrossLanguage(query: string): string {
  const expanded: string[] = [query];
  for (const [zh, enList] of Object.entries(CROSS_LANG_MAP)) {
    if (query.includes(zh)) {
      expanded.push(...enList);
    }
  }
  return expanded.join(" ");
}

// ── 法律同义词扩展 ─────────────────────────────────────────

const LEGAL_SYNONYMS: Record<string, string[]> = {
  "新颖性": ["novelty", "new"],
  "创造性": ["inventive step", "inventiveness", "非显而易见性"],
  "实用性": ["utility", "工业实用性"],
  "充分公开": ["sufficient disclosure", "enablement"],
  "权利要求": ["claim", "claims", "权项"],
  "说明书": ["specification", "description"],
  "修改": ["amendment", "修改"],
  "答复": ["response", "reply"],
};

/** 法律同义词查询扩展 */
function expandQuery(query: string): string {
  const expanded: string[] = [query];
  for (const [term, synonyms] of Object.entries(LEGAL_SYNONYMS)) {
    if (query.includes(term)) {
      expanded.push(...synonyms);
    }
  }
  return expanded.join(" ");
}

// ── 法条知识图谱扩展 ───────────────────────────────────────

interface ArticleNode {
  id: string;
  name: string;
  category: string;
  relatedArticles: string[];
  keywords: string[];
}

const ARTICLE_GRAPH: ArticleNode[] = [
  {
    id: "§22.2",
    name: "新颖性",
    category: "patent-law",
    relatedArticles: ["§22.3", "§22.1", "§22.4"],
    keywords: ["新颖性", "单独对比", "现有技术", "抵触申请", "公开"],
  },
  {
    id: "§22.3",
    name: "创造性",
    category: "patent-law",
    relatedArticles: ["§22.2", "§22.1", "§22.4"],
    keywords: ["创造性", "三步法", "技术启示", "显而易见", "区别特征"],
  },
  {
    id: "§22.1",
    name: "新颖性·创造性·实用性总则",
    category: "patent-law",
    relatedArticles: ["§22.2", "§22.3", "§22.4"],
    keywords: ["新颖性", "创造性", "实用性"],
  },
  {
    id: "§22.4",
    name: "实用性",
    category: "patent-law",
    relatedArticles: ["§22.1"],
    keywords: ["实用性", "工业应用", "制造"],
  },
  {
    id: "§26.3",
    name: "说明书充分公开",
    category: "patent-law",
    relatedArticles: ["§26.4", "§26.1"],
    keywords: ["说明书", "充分公开", "清楚", "完整", "实现"],
  },
  {
    id: "§26.4",
    name: "权利要求书·清楚·支持",
    category: "patent-law",
    relatedArticles: ["§26.3", "§26.1"],
    keywords: ["权利要求", "清楚", "简要", "说明书支持"],
  },
  {
    id: "§31",
    name: "单一性",
    category: "patent-law",
    relatedArticles: ["§22.1"],
    keywords: ["单一性", "特定技术特征", "总的技术构思"],
  },
  {
    id: "§33",
    name: "修改超范围",
    category: "patent-law",
    relatedArticles: ["§26.3"],
    keywords: ["修改", "超范围", "原始申请", "记载范围"],
  },
  {
    id: "§9",
    name: "先申请原则",
    category: "patent-law",
    relatedArticles: ["§22.2"],
    keywords: ["先申请", "同一发明", "同日申请"],
  },
  {
    id: "§24",
    name: "不丧失新颖性宽限",
    category: "patent-law",
    relatedArticles: ["§22.2"],
    keywords: ["宽限期", "不丧失新颖性", "首次公开"],
  },
  {
    id: "§29",
    name: "优先权",
    category: "patent-law",
    relatedArticles: ["§22.2", "§9"],
    keywords: ["优先权", "优先权日", "外国优先权", "本国优先权"],
  },
];

/** 获取法条图谱的扩展查询词 */
function expandQueryWithGraph(query: string): string {
  const expanded = new Set<string>([query]);

  for (const node of ARTICLE_GRAPH) {
    const isRelevant = node.keywords.some((kw) => query.includes(kw));
    if (isRelevant) {
      for (const relatedId of node.relatedArticles) {
        const related = ARTICLE_GRAPH.find((n) => n.id === relatedId);
        if (related) {
          for (const kw of related.keywords) {
            expanded.add(kw);
          }
        }
      }
    }
  }

  return Array.from(expanded).join(" ");
}

// ── 组合扩展 ───────────────────────────────────────────────

/** 组合所有扩展策略：跨语言 → 法律同义词 → 法条图谱 */
export function expandQueryFull(query: string): string {
  return expandCrossLanguage(expandQuery(expandQueryWithGraph(query)));
}
