import { useState, useRef, useEffect, useMemo } from "react";
import { useParams, useLocation } from "react-router-dom";
import { useChatStore, useCaseStore } from "../../store";
import { ChatBubble } from "./ChatBubble";
import { buildContextSummary } from "../../lib/chatContext";
import { AgentClient } from "../../agent/AgentClient";
import { createSession, createMessage, deleteSession, deleteMessagesBySessionId, updateSession, getSessionsByCaseId, getMessagesBySessionId } from "../../lib/repositories/chatRepo";
import type { ChatMessage, ChatSession, ModuleScope } from "@shared/types/domain";
import type { ChatRequest } from "../../agent/contracts";

const DEBUG = true;
function log(...args: unknown[]) {
  if (DEBUG) console.log("[ChatPanel]", ...args);
}

const MODULE_LABELS: Record<string, string> = {
  baseline: "案件基本信息",
  documents: "文档导入",
  references: "文献清单",
  interpret: "文档解读",
  "claim-chart": "权利要求特征表",
  novelty: "新颖性对照",
  inventive: "创造性分析",
  defects: "形式缺陷",
  draft: "素材草稿",
  export: "导出"
};

const MODULE_SCOPE_MAP: Record<string, ModuleScope> = {
  baseline: "case",
  documents: "documents",
  references: "documents",
  interpret: "interpret",
  "claim-chart": "claim-chart",
  novelty: "novelty",
  inventive: "inventive",
  defects: "defects",
  draft: "draft",
  export: "summary"
};

function deriveModuleScope(pathname: string): ModuleScope {
  const match = pathname.match(/\/cases\/[^/]+\/([^/]+)/);
  const pathSegment = match?.[1] ?? "case";
  return MODULE_SCOPE_MAP[pathSegment] ?? "case";
}

function deriveModuleLabel(pathname: string): string {
  const match = pathname.match(/\/cases\/[^/]+\/([^/]+)/);
  return MODULE_LABELS[match?.[1] ?? ""] ?? "案件";
}

export function ChatPanel() {
  const { caseId } = useParams<{ caseId: string }>();
  const location = useLocation();
  const { currentCase } = useCaseStore();

  const moduleScope = deriveModuleScope(location.pathname);
  const moduleLabel = deriveModuleLabel(location.pathname);

  const {
    sessions, messages, activeSessionId, isPanelOpen, isLoading,
    loadSessions, loadMessages, addSession, removeSession, renameSession, setActiveSessionId, addMessage, setPanelOpen, setLoading
  } = useChatStore();

  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [panelWidth, setPanelWidth] = useState(340);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Load sessions + messages from IndexedDB on mount / caseId change
  useEffect(() => {
    log("useEffect triggered, caseId:", caseId);
    if (!caseId) return;
    let cancelled = false;
    (async () => {
      try {
        log("Loading sessions from IndexedDB for caseId:", caseId);
        // First, get all sessions
        const storedSessions = await getSessionsByCaseId(caseId);
        log("Loaded sessions:", storedSessions.length);
        if (cancelled) return;
        loadSessions(storedSessions);
        log("Called loadSessions");

        // Load messages for each session
        const allMessages: typeof messages = [];
        for (const s of storedSessions) {
          log("Loading messages for session:", s.id);
          const msgs = await getMessagesBySessionId(s.id);
          log("Loaded messages:", msgs.length, "for session:", s.id);
          allMessages.push(...msgs);
        }
        log("Total messages loaded:", allMessages.length);
        if (!cancelled) {
          loadMessages(allMessages);
          log("Called loadMessages");
        }
      } catch (error) {
        console.error('[ChatPanel] Failed to load chat history from IndexedDB', error);
        // Fallback: use in-memory store only if IndexedDB fails
      }
    })();
    return () => { 
      log("useEffect cleanup, cancelled:", cancelled);
      cancelled = true; 
    };
  }, [caseId]);

  // All sessions for current case (not filtered by module — user controls session lifecycle)
  const caseSessions = useMemo(() => {
    const result = sessions.filter((s) => s.caseId === caseId);
    log("caseSessions computed:", result.length, "sessions for caseId:", caseId);
    return result;
  }, [sessions, caseId]);

  // Active session: prefer activeSessionId, fallback to first case session
  const effectiveSessionId = useMemo(() => {
    if (activeSessionId && caseSessions.some((s) => s.id === activeSessionId)) {
      log("effectiveSessionId using activeSessionId:", activeSessionId);
      return activeSessionId;
    }
    const fallback = caseSessions[0]?.id ?? null;
    log("effectiveSessionId fallback:", fallback);
    return fallback;
  }, [activeSessionId, caseSessions]);

  // Messages for active session
  const sessionMessages = useMemo(() => {
    const result = messages.filter((m) => m.sessionId === effectiveSessionId);
    log("sessionMessages computed:", result.length, "messages for sessionId:", effectiveSessionId);
    return result;
  }, [messages, effectiveSessionId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessionMessages.length]);

  if (!caseId) {
    log("Early return: caseId is null");
    return null;
  }
  if (!currentCase) {
    log("Early return: currentCase is null - this may cause chat history not to load!");
    // Note: We still return null, but the useEffect should have already run
    // to load chat sessions from IndexedDB
    return null;
  }

  const handleNewSession = async () => {
    log("handleNewSession called");
    const now = new Date().toISOString();
    const session: ChatSession = {
      id: `chat-${caseId}-${moduleScope}-${Date.now()}`,
      caseId,
      moduleScope,
      title: `${moduleLabel} 讨论`,
      createdAt: now,
      updatedAt: now
    };
    log("Creating session:", session.id);
    addSession(session);
    setActiveSessionId(session.id);
    try { 
      await createSession(session); 
      log("Session saved to IndexedDB:", session.id);
    } catch (e) { 
      log("createSession error:", e);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    log("handleSend called, text:", text.substring(0, 50) + "...");
    // Auto-create session if none exists
    let sessionId = effectiveSessionId;
    if (!sessionId) {
      log("No session, creating new one");
      const now = new Date().toISOString();
      const session: ChatSession = {
        id: `chat-${caseId}-${moduleScope}-${Date.now()}`,
        caseId,
        moduleScope,
        title: `${moduleLabel} 讨论`,
        createdAt: now,
        updatedAt: now
      };
      addSession(session);
      sessionId = session.id;
      setActiveSessionId(session.id);
      try { 
        await createSession(session); 
        log("Session saved to IndexedDB:", session.id);
      } catch (e) { 
        log("createSession error:", e);
      }
    }

    setInput("");

    // Add user message
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      caseId,
      sessionId,
      moduleScope,
      role: "user",
      content: text,
      createdAt: new Date().toISOString()
    };
    log("Adding user message:", userMsg.id);
    addMessage(userMsg);
    try { 
      await createMessage(userMsg); 
      log("User message saved to IndexedDB:", userMsg.id);
    } catch (e) { 
      log("createMessage error:", e);
    }

    // Call AI
    setLoading(true);
    try {
      const settings = (await import("../../store")).useSettingsStore.getState().settings;
      const client = new AgentClient(settings.mode, "/api", settings);

      const contextSummary = buildContextSummary(caseId, moduleScope);
      const history = messages
        .filter((m) => m.sessionId === sessionId)
        .slice(-10)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      const request: ChatRequest = {
        caseId,
        sessionId,
        moduleScope,
        userMessage: text,
        contextSummary,
        history
      };

      log("Calling AI...");
      const response = await client.runChat(request);

      let replyContent = response.reply;
      if (response.action) {
        replyContent += `\n[action:${response.action.target}]`;
      }

      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}-assistant`,
        caseId,
        sessionId,
        moduleScope,
        role: "assistant",
        content: replyContent,
        createdAt: new Date().toISOString()
      };
      log("Adding assistant message:", assistantMsg.id);
      addMessage(assistantMsg);
      try { 
        await createMessage(assistantMsg); 
        log("Assistant message saved to IndexedDB:", assistantMsg.id);
      } catch (e) { 
        log("createMessage error:", e);
      }
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now()}-error`,
        caseId,
        sessionId,
        moduleScope,
        role: "assistant",
        content: `请求失败: ${err instanceof Error ? err.message : String(err)}\n\n请检查 API Key 配置是否正确，或切换到演示模式。`,
        createdAt: new Date().toISOString()
      };
      addMessage(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAction = (target: string) => {
    window.dispatchEvent(new CustomEvent("chat-action", { detail: { target, caseId } }));
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = panelRef.current;
    if (!el) return;
    dragRef.current = { startX: e.clientX, startWidth: el.offsetWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - ev.clientX;
      const newWidth = Math.max(280, Math.min(600, dragRef.current.startWidth + delta));
      el.style.width = newWidth + "px";
    };

    const onMouseUp = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - ev.clientX;
      const finalWidth = Math.max(280, Math.min(600, dragRef.current.startWidth + delta));
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setPanelWidth(finalWidth);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleDeleteSession = async (id: string) => {
    log("handleDeleteSession:", id);
    removeSession(id);
    await deleteSession(id);
    await deleteMessagesBySessionId(id);
  };

  const handleStartRename = (s: ChatSession) => {
    setEditingId(s.id);
    setEditTitle(s.title);
  };

  const handleConfirmRename = async (id: string) => {
    const title = editTitle.trim();
    if (!title) return;
    renameSession(id, title);
    const session = sessions.find((s) => s.id === id);
    if (session) await updateSession({ ...session, title, updatedAt: new Date().toISOString() });
    setEditingId(null);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter") handleConfirmRename(id);
    if (e.key === "Escape") setEditingId(null);
  };

  return (
    <aside
      ref={panelRef}
      className={`chat-panel ${isPanelOpen ? "chat-panel--open" : "chat-panel--collapsed"}`}
      style={isPanelOpen ? { width: panelWidth + "px" } : undefined}
      data-testid="chat-panel"
    >
      {isPanelOpen && (
        <div
          className="chat-panel__resize-handle"
          onMouseDown={handleResizeStart}
          data-testid="chat-resize-handle"
        />
      )}
      <div className="chat-panel__header">
        <span className="chat-panel__icon">🤖</span>
        <span className="chat-panel__title">AI 助手 · {moduleLabel}</span>
        <button
          type="button"
          className="chat-panel__toggle"
          onClick={() => setPanelOpen(!isPanelOpen)}
          aria-label={isPanelOpen ? "折叠聊天" : "展开聊天"}
          data-testid="chat-toggle"
        >
          {isPanelOpen ? "›" : "‹"}
        </button>
      </div>

      {isPanelOpen && (
        <>
          {/* Session tabs — all sessions for this case */}
          <div className="chat-panel__sessions">
            {caseSessions.map((s) => (
              <div
                key={s.id}
                className={`chat-session-tab ${s.id === effectiveSessionId ? "chat-session-tab--active" : ""}`}
                data-testid={`session-tab-${s.id}`}
              >
                {editingId === s.id ? (
                  <input
                    className="chat-session-tab__input"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={() => handleConfirmRename(s.id)}
                    onKeyDown={(e) => handleRenameKeyDown(e, s.id)}
                    autoFocus
                    data-testid={`session-rename-${s.id}`}
                  />
                ) : (
                  <span
                    className="chat-session-tab__title"
                    onClick={() => setActiveSessionId(s.id)}
                    onDoubleClick={() => handleStartRename(s)}
                    title="双击重命名"
                  >
                    {s.title}
                  </span>
                )}
                <button
                  type="button"
                  className="chat-session-tab__delete"
                  onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id); }}
                  title="删除对话"
                  data-testid={`session-delete-${s.id}`}
                >
                  &times;
                </button>
              </div>
            ))}
            <button
              type="button"
              className="chat-session-tab chat-session-tab--new"
              onClick={handleNewSession}
              data-testid="btn-new-session"
              title="新建对话"
            >
              +
            </button>
          </div>

          {/* Messages */}
          <div className="chat-panel__messages" data-testid="chat-messages">
            {sessionMessages.length === 0 && (
              <div className="chat-panel__empty">
                <p>开始与 AI 讨论{moduleLabel}相关内容。</p>
                <p className="chat-panel__empty-hint">AI 了解当前模块的数据，可以帮您分析和修改。</p>
              </div>
            )}
            {sessionMessages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} onAction={handleAction} />
            ))}
            {isLoading && (
              <div className="chat-bubble chat-bubble--assistant chat-bubble--loading">
                <div className="chat-bubble__content">
                  <p>AI 思考中...</p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="chat-panel__input">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
              rows={3}
              data-testid="chat-input"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              title="发送 (Enter)"
              data-testid="btn-send-chat"
            >
              ↑
            </button>
          </div>
        </>
      )}
    </aside>
  );
}