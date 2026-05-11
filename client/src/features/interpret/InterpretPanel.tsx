import { useState, useEffect, useRef } from "react";
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
  const [summary, setSummary] = useState("");
  const [summarySaved, setSummarySaved] = useState(false);
  const autoTriggered = useRef(false);

  useEffect(() => {
    if (documentText && messages.length === 0 && !isLoading && !autoTriggered.current) {
      autoTriggered.current = true;
      doInterpret("请解读此专利文档：简要说明技术领域、核心技术方案、主要权利要求和关键实施例。");
    }
  }, [documentText]);

  const doInterpret = async (prompt: string) => {
    if (!documentText || isLoading) return;

    setIsLoading(true);
    setSummarySaved(false);
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      caseId,
      moduleScope: "case",
      role: "user",
      content: prompt,
      createdAt: new Date().toISOString()
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
        createdAt: new Date().toISOString()
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setSummary(response);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFollowUp = async () => {
    if (!input.trim() || isLoading) return;
    const prompt = input.trim();
    setInput("");
    await doInterpret(prompt);
  };

  const handleSaveSummary = () => {
    setSummarySaved(true);
    setTimeout(() => setSummarySaved(false), 2000);
  };

  return (
    <div className="interpret-panel" data-testid="interpret-panel">
      <h2>文档解读</h2>

      {!documentText ? (
        <p data-testid="no-document">请先上传专利文档。</p>
      ) : (
        <div className="interpret-layout">
          <div className="interpret-main">
            <div className="interpret-main__header">
              <h3>解读结果</h3>
              <span className="interpret-main__hint">可直接编辑内容</span>
            </div>
            <textarea
              className="interpret-summary"
              value={summary}
              onChange={(e) => { setSummary(e.target.value); setSummarySaved(false); }}
              placeholder={isLoading ? "AI 解读中…" : "点击右侧对话区提问，解读结果将显示在此处。"}
              data-testid="interpret-summary"
              readOnly={isLoading}
            />
            <div className="interpret-main__actions">
              <button
                type="button"
                onClick={handleSaveSummary}
                disabled={!summary}
                data-testid="btn-save-summary"
              >
                {summarySaved ? "已保存" : "保存解读"}
              </button>
            </div>
          </div>

          <div className="interpret-chat">
            <div className="interpret-chat__header">
              <h3>AI 对话</h3>
            </div>
            <div className="chat-messages" data-testid="chat-messages">
              {messages.length === 0 && !isLoading && (
                <p className="chat-empty-hint">解读结果将自动显示在左侧。您也可以在此追问。</p>
              )}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`message message-${msg.role}`}
                  data-testid={`message-${msg.role}-${msg.id}`}
                >
                  <div className="message-role">{msg.role === "user" ? "审查员" : "AI"}</div>
                  <div className="message-content">{msg.content}</div>
                </div>
              ))}
              {isLoading && messages.length % 2 === 1 && (
                <div className="message message-assistant">
                  <div className="message-role">AI</div>
                  <div className="message-content">解读中…</div>
                </div>
              )}
            </div>

            <div className="follow-up" data-testid="follow-up">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="追问，例如：核心创新点？与现有技术的区别？"
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
          </div>
        </div>
      )}
    </div>
  );
}
