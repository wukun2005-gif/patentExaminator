import { useState } from "react";
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

/** 将文本中的 [1] [2] 等引用标记解析为带链接的 React 元素 */
function renderWithCitations(text: string, citations: CitationInfo[]) {
  if (citations.length === 0) return text;
  const parts: Array<string | JSX.Element> = [];
  const regex = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const num = parseInt(match[1] ?? "0", 10);
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (num >= 1 && num <= citations.length) {
      parts.push(
        <sup
          key={`cite-${match.index}`}
          className="chat-bubble__inline-cite"
          title={citations[num - 1]?.source ?? ""}
        >
          [{num}]
        </sup>
      );
    } else {
      parts.push(match[0]);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

/** 将一行文本中的 [1] 引用标记渲染为链接 */
function LineWithCitations({ text, citations }: { text: string; citations: CitationInfo[] }) {
  const rendered = renderWithCitations(text, citations);
  if (typeof rendered === "string") return <p>{text || " "}</p>;
  return <p>{rendered}</p>;
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

  return (
    <div className={`chat-bubble chat-bubble--${message.role}`} data-testid={`chat-bubble-${message.id}`}>
      <div className="chat-bubble__header">
        <span className="chat-bubble__role">{isUser ? "您" : "AI"}</span>
        <span className="chat-bubble__time">
          {new Date(message.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      <div className="chat-bubble__content">
        {displayContent.split("\n").map((line) => (
          <LineWithCitations
            key={`line-${line.slice(0, 20)}`}
            text={line}
            citations={citations}
          />
        ))}
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
