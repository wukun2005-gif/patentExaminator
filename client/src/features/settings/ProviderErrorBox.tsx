import { useState } from "react";
import { useSettingsStore } from "../../store";
import type { ProviderId } from "@shared/types/agents";

const PROVIDER_NAMES: Record<ProviderId, string> = {
  kimi: "Kimi",
  glm: "GLM",
  minimax: "MiniMax",
  mimo: "MiMo",
  deepseek: "DeepSeek",
  gemini: "Gemini",
  qwen: "Qwen",
  bedrock: "Bedrock",
  openrouter: "OpenRouter",
  opencode: "OpenCode",
  doubao: "火山"
};

const ERROR_BRIEF: Record<string, string> = {
  "quota-exceeded": "配额用尽",
  "auth-failed": "API Key 无效",
  "bad-request": "请求格式错误",
  "server-error": "服务端错误",
  "network": "网络连接失败",
  "timeout": "请求超时",
  "adapter-not-found": "Provider 未注册",
  "unknown": "未知错误",
};

function getBrief(errorCode: string): string {
  return ERROR_BRIEF[errorCode] ?? errorCode;
}

export function ProviderErrorBox() {
  const { settings, setSettings } = useSettingsStore();
  const messages = settings.providerErrorMessages ?? [];
  const unreadCount = messages.filter((m) => !m.read).length;
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const handleMarkAllRead = () => {
    setSettings({
      ...settings,
      providerErrorMessages: messages.map((m) => ({ ...m, read: true }))
    });
  };

  const handleClearAll = () => {
    setSettings({ ...settings, providerErrorMessages: [] });
  };

  const handleToggleRead = (id: string) => {
    setSettings({
      ...settings,
      providerErrorMessages: messages.map((m) =>
        m.id === id ? { ...m, read: !m.read } : m
      )
    });
  };

  const handleToggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (messages.length === 0) {
    return (
      <div className="provider-error-box provider-error-box--empty" data-testid="provider-error-box">
        <p className="panel-desc">暂无 AI 服务商错误消息。</p>
      </div>
    );
  }

  return (
    <div className="provider-error-box" data-testid="provider-error-box">
      <div className="provider-error-box__header">
        <span className="provider-error-box__title">
          服务商错误消息
          {unreadCount > 0 && (
            <span className="provider-error-box__badge" data-testid="error-unread-badge">
              {unreadCount} 条未读
            </span>
          )}
        </span>
        <div className="provider-error-box__actions">
          {unreadCount > 0 && (
            <button
              type="button"
              className="provider-error-box__btn"
              onClick={handleMarkAllRead}
              data-testid="error-mark-all-read"
            >
              全部已读
            </button>
          )}
          <button
            type="button"
            className="provider-error-box__btn provider-error-box__btn--danger"
            onClick={handleClearAll}
            data-testid="error-clear-all"
          >
            清空
          </button>
        </div>
      </div>
      <div className="provider-error-box__list">
        {messages.map((msg) => {
          const expanded = expandedIds.has(msg.id);
          return (
            <div
              key={msg.id}
              className={`provider-error-box__item ${msg.read ? "" : "provider-error-box__item--unread"}`}
              data-testid={`error-msg-${msg.id}`}
            >
              <button
                type="button"
                className="provider-error-box__read-toggle"
                onClick={() => handleToggleRead(msg.id)}
                aria-label={msg.read ? "标记为未读" : "标记为已读"}
                data-testid={`error-toggle-read-${msg.id}`}
              >
                <span className={`provider-error-box__dot ${msg.read ? "" : "provider-error-box__dot--unread"}`} />
              </button>
              <div className="provider-error-box__content">
                <div className="provider-error-box__summary">
                  <div className="provider-error-box__meta">
                    <span className="provider-error-box__provider">
                      {PROVIDER_NAMES[msg.providerId] ?? msg.providerId}
                    </span>
                    {msg.modelId && (
                      <span className="provider-error-box__model">{msg.modelId}</span>
                    )}
                    <span className={`provider-error-box__code provider-error-box__code--${msg.errorCode}`}>
                      {getBrief(msg.errorCode)}
                    </span>
                    {msg.agent && (
                      <span className="provider-error-box__agent">{msg.agent}</span>
                    )}
                  </div>
                  <div className="provider-error-box__right">
                    <span className="provider-error-box__time">
                      {new Date(msg.timestamp).toLocaleString()}
                    </span>
                    <button
                      type="button"
                      className="provider-error-box__expand-btn"
                      onClick={() => handleToggleExpand(msg.id)}
                      aria-expanded={expanded}
                      data-testid={`error-toggle-expand-${msg.id}`}
                    >
                      {expanded ? "收起" : "详情"}
                    </button>
                  </div>
                </div>
                {expanded && (
                  <div className="provider-error-box__details" data-testid={`error-details-${msg.id}`}>
                    {msg.message}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}