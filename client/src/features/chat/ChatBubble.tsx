import type { ChatMessage } from "@shared/types/domain";

interface ChatBubbleProps {
  message: ChatMessage;
  onAction?: (target: string) => void;
}

export function ChatBubble({ message, onAction }: ChatBubbleProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  // Detect action in content (simple pattern: action://target)
  const actionMatch = message.content.match(/\[action:(\S+?)\]/);
  const actionTarget = actionMatch?.[1];
  const displayContent = message.content.replace(/\[action:\S+?\]/g, "").trim();

  return (
    <div className={`chat-bubble chat-bubble--${message.role}`} data-testid={`chat-bubble-${message.id}`}>
      <div className="chat-bubble__header">
        <span className="chat-bubble__role">{isUser ? "您" : "AI"}</span>
        <span className="chat-bubble__time">
          {new Date(message.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      <div className="chat-bubble__content">
        {displayContent.split("\n").map((line, i) => (
          <p key={i}>{line || " "}</p>
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
    </div>
  );
}
