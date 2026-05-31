/**
 * 法条知识图谱 — 建立法条之间的引用和关联关系
 */

export interface ArticleNode {
  id: string;           // 如 "§22.2", "§22.3", "§26.3"
  name: string;         // 如 "新颖性", "创造性", "清楚简要"
  category: "patent-law" | "implementation-rules" | "examination-guidelines" | "judicial-interpretation";
  relatedArticles: string[];  // 关联的法条 ID
  keywords: string[];         // 关键词
}

/** 核心法条知识图谱（覆盖专利审查最常用的法条） */
export const ARTICLE_GRAPH: ArticleNode[] = [
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

/** 获取指定法条的关联法条 */
export function getRelatedArticles(articleId: string): ArticleNode[] {
  const node = ARTICLE_GRAPH.find((n) => n.id === articleId);
  if (!node) return [];
  return node.relatedArticles
    .map((id) => ARTICLE_GRAPH.find((n) => n.id === id))
    .filter((n): n is ArticleNode => n !== undefined);
}

/** 根据关键词查找相关法条 */
export function findArticlesByKeyword(keyword: string): ArticleNode[] {
  return ARTICLE_GRAPH.filter((node) =>
    node.keywords.some((kw) => kw.includes(keyword) || keyword.includes(kw))
  );
}

/** 获取法条图谱的扩展查询词（用于检索增强） */
export function expandQueryWithGraph(query: string): string {
  const expanded = new Set<string>([query]);

  for (const node of ARTICLE_GRAPH) {
    const isRelevant = node.keywords.some((kw) => query.includes(kw));
    if (isRelevant) {
      // 添加关联法条的关键词
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
