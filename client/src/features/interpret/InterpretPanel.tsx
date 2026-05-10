import { useState } from "react";
import type { ChatMessage } from "@shared/types/domain";

interface InterpretPanelProps {
  caseId: string;
  documentText?: string;
  runInterpret: (prompt: string) => Promise<string>;
}

export function InterpretPanel({ caseId, documentText, runInterpret }: InterpretPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleInterpret = async () => {
    if (!documentText || isLoading) return;

    setIsLoading(true);
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      caseId,
      moduleScope: "case",
      role: "user",
      content: "请解读此专利文档",
      timestamp: new Date().toISOString()
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const response = await runInterpret(documentText);
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        caseId,
        moduleScope: "case",
        role: "assistant",
        content: response,
        timestamp: new Date().toISOString()
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFollowUp = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      caseId,
      moduleScope: "case",
      role: "user",
      content: input.trim(),
      timestamp: new Date().toISOString()
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await runInterpret(input.trim());
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        caseId,
        moduleScope: "case",
        role: "assistant",
        content: response,
        timestamp: new Date().toISOString()
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="interpret-panel" data-testid="interpret-panel">
      <h2>文档解读</h2>

      {!documentText ? (
        <p data-testid="no-document">请先上传专利文档。</p>
      ) : (
        <>
          <div className="interpret-actions">
            <button
              type="button"
              onClick={handleInterpret}
              disabled={isLoading || messages.length > 0}
              data-testid="btn-interpret"
            >
              {isLoading ? "解读中..." : "解读此专利"}
            </button>
          </div>

          <div className="chat-messages" data-testid="chat-messages">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`message ${msg.role}`}
                data-testid={`message-${msg.role}-${msg.id}`}
              >
                <div className="message-role">{msg.role === "user" ? "审查员" : "AI"}</div>
                <div className="message-content">{msg.content}</div>
              </div>
            ))}
          </div>

          {messages.length > 0 && (
            <div className="follow-up" data-testid="follow-up">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="输入追问..."
                data-testid="input-follow-up"
                rows={2}
              />
              <button
                type="button"
                onClick={handleFollowUp}
                disabled={!input.trim() || isLoading}
                data-testid="btn-follow-up"
              >
                发送
              </button>
            </div>
          )}
        </>
      )}

      <p className="case-ref">案件 ID: {caseId}</p>
    </div>
  );
}
