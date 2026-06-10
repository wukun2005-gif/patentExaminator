import { useState, useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { ChatMessage } from "@shared/types/domain";

interface ChatBubbleProps {
  message: ChatMessage;
  onAction?: (target: string) => void;
}

interface CitationInfo {
  source: string;
  sourceId?: string;
  article?: string;
}

/** 将 markdown 文本渲染为安全的 HTML（含引用标记处理） */
function renderMarkdown(text: string, citations: CitationInfo[]): string {
  // 先将 [N] 引用标记替换为 HTML superscript（在 markdown 解析之前）
  let processed = text;
  if (citations.length > 0) {
    processed = processed.replace(/\[(\d+)\]/g, (match, numStr) => {
      const num = parseInt(numStr, 10);
      if (num >= 1 && num <= citations.length) {
        const source = citations[num - 1]?.source ?? "";
        return `<sup class="chat-bubble__inline-cite" title="${source}">[${num}]</sup>`;
      }
      return match;
    });
  }
  // marked 解析 markdown → DOMPurify 净化 HTML
  const rawHtml = marked.parse(processed, { async: false }) as string;
  return DOMPurify.sanitize(rawHtml);
}

export function ChatBubble({ message, onAction }: ChatBubbleProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const [expandedCite, setExpandedCite] = useState<number | null>(null);

  // Detect action in content (simple pattern: action://target)
  const content = message.content ?? "";
  const actionMatch = content.match(/\[action:(\S+?)\]/);
  const actionTarget = actionMatch?.[1];
  const displayContent = content.replace(/\[action:\S+?\]/g, "").trim();

  // server 已合并排序好的引用列表（RAG + Web 按相关性排列的 top-K）
  const citations = (message.mergedCitations ?? []).map((c) => ({ source: c.title ?? c.url ?? "", excerpt: c.snippet ?? "" }));

  // markdown 渲染（memoize 避免重复解析）
  const htmlContent = useMemo(
    () => (isAssistant ? renderMarkdown(displayContent, citations) : ""),
    [displayContent, isAssistant, citations],
  );

  return (
    <div className={`chat-bubble chat-bubble--${message.role}`} data-testid={`chat-bubble-${message.id}`}>
      <div className="chat-bubble__header">
        <span className="chat-bubble__role">{isUser ? "您" : "AI"}</span>
        <span className="chat-bubble__time">
          {new Date(message.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      <div className="chat-bubble__content">
        {/* nf3: 用户消息附件展示 */}
        {isUser && message.attachments && message.attachments.length > 0 && (
          <div className="chat-bubble__attachments">
            {message.attachments.map((a, i) => (
              <span key={`${a.fileName}-${i}`} className="chat-bubble__attachment-tag">
                {a.mimeType.startsWith("image/") ? "🖼️" : "📄"} {a.fileName}
              </span>
            ))}
          </div>
        )}
        {isAssistant ? (
          <div className="chat-bubble__markdown" dangerouslySetInnerHTML={{ __html: htmlContent }} />
        ) : (
          <p>{displayContent}</p>
        )}
      </div>
      {isAssistant && actionTarget && onAction && (
        <div className="chat-bubble__action">
          <button
            type="button"
            className="btn-action-apply"
            onClick={() => onAction(actionTarget)}
            data-testid={`btn-action-${message.id}`}
          >
            应用修改
          </button>
        </div>
      )}
      {(message.groundedness || message.mergedCitations?.length) && (
        <div className="quality-badge" data-testid="quality-badge">
          {message.groundedness?.verdict === 'pass' && <span className="quality-badge__grounded quality-badge__pass">✅ 已验证</span>}
          {message.groundedness?.verdict === 'partial' && <span className="quality-badge__grounded quality-badge__partial">⚠️ 部分有据</span>}
          {message.groundedness?.verdict === 'fail' && <span className="quality-badge__grounded quality-badge__fail">❌ 无据声明已过滤</span>}
          {message.mergedCitations?.length > 0 && (
            <span className="quality-badge__citations">引用 {message.mergedCitations.length} 条来源</span>
          )}
        </div>
      )}
      {isAssistant && citations.length > 0 && (
        <div className="chat-bubble__citations">
          <div className="chat-bubble__citations-header">参考文档</div>
          {citations.map((c, i) => (
            <div
              key={`${c.source}-${i}`}
              className={`chat-bubble__citation-item${expandedCite === i ? " chat-bubble__citation-item--expanded" : ""}`}
              onClick={() => setExpandedCite(expandedCite === i ? null : i)}
            >
              <span className="chat-bubble__citation-num">[{i + 1}]</span>
              <div className="chat-bubble__citation-body">
                <span className="chat-bubble__citation-source">{c.source}</span>
                {c.excerpt && <span className="chat-bubble__citation-excerpt">{c.excerpt}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
