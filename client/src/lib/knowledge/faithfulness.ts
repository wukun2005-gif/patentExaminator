/**
 * Faithfulness 检测 — 检查 Agent 输出是否引用了注入的知识库内容
 */

/** 检查 Agent 输出是否引用了知识库 chunk 内容 */
export function checkFaithfulness(
  agentOutput: string,
  injectedChunks: Array<{ text: string; metadata: { fileName?: string; sectionId?: string; articleId?: string } }>,
  threshold: number = 0.3
): { score: number; matchedChunks: number; totalChunks: number; details: string[] } {
  if (injectedChunks.length === 0) {
    return { score: 1, matchedChunks: 0, totalChunks: 0, details: ["无注入内容"] };
  }

  const details: string[] = [];
  let matchedChunks = 0;

  for (const chunk of injectedChunks) {
    // 检查 chunk 中的关键短语是否出现在 Agent 输出中
    const keyPhrases = extractKeyPhrases(chunk.text);
    const matched = keyPhrases.filter((phrase) =>
      agentOutput.includes(phrase) || agentOutput.includes(phrase.slice(0, 20))
    );

    if (matched.length > 0) {
      matchedChunks++;
      const source = chunk.metadata.sectionId ?? chunk.metadata.articleId ?? chunk.metadata.fileName ?? "未知来源";
      details.push(`✅ 引用了 ${source}（匹配 ${matched.length}/${keyPhrases.length} 个关键短语）`);
    } else {
      const source = chunk.metadata.sectionId ?? chunk.metadata.articleId ?? chunk.metadata.fileName ?? "未知来源";
      details.push(`❌ 未引用 ${source}`);
    }
  }

  const score = matchedChunks / injectedChunks.length;
  return { score, matchedChunks, totalChunks: injectedChunks.length, details };
}

/** 从 chunk 文本中提取关键短语 */
function extractKeyPhrases(text: string): string[] {
  const phrases: string[] = [];

  // 提取法条引用
  const articleRefs = text.match(/第[一二三四五六七八九十百千零\d]+条(?:第[一二三四五六七八九十百千零\d]+款)?/g);
  if (articleRefs) phrases.push(...articleRefs);

  // 提取章节编号
  const sectionRefs = text.match(/(?:第[一二三四五六七八九十百千]+部分|第[一二三四五六七八九十百千]+章)(?:第[一二三四五六七八九十百千]+节)?/g);
  if (sectionRefs) phrases.push(...sectionRefs);

  // 提取数字编号的段落引用
  const numberedRefs = text.match(/\d+\.\d+(?:\.\d+)?/g);
  if (numberedRefs) phrases.push(...numberedRefs.slice(0, 5));

  // 提取较长的中文短语（>= 10 字）
  const sentences = text.split(/[。；\n]/).filter((s) => s.trim().length >= 10 && s.trim().length <= 50);
  phrases.push(...sentences.slice(0, 3).map((s) => s.trim()));

  return [...new Set(phrases)].slice(0, 10);
}
