import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ChatPanel } from "@client/features/chat/ChatPanel";
import { ChatBubble } from "@client/features/chat/ChatBubble";
import { useChatStore, useCaseStore } from "@client/store";
import type { ChatMessage, ChatSession, PatentCase } from "@shared/types/domain";

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: "session-test-1",
    caseId: "test",
    moduleScope: "claim-chart",
    title: "Claim Chart 讨论",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-test-1",
    caseId: "test",
    sessionId: "session-test-1",
    moduleScope: "claim-chart",
    role: "user",
    content: "测试消息",
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

function renderChatAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/cases/:caseId/*" element={<ChatPanel />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ChatBubble", () => {
  it("用户消息显示正确", () => {
    const msg = makeMessage({ role: "user", content: "你好" });
    render(<ChatBubble message={msg} />);
    expect(screen.getByText("您")).toBeTruthy();
    expect(screen.getByText("你好")).toBeTruthy();
  });

  it("AI 消息显示正确", () => {
    const msg = makeMessage({ id: "msg-ai", role: "assistant", content: "AI 回复" });
    render(<ChatBubble message={msg} />);
    expect(screen.getByText("AI")).toBeTruthy();
    expect(screen.getByText("AI 回复")).toBeTruthy();
  });

  it("AI 消息带 action 时显示按钮", () => {
    const msg = makeMessage({
      id: "msg-action",
      role: "assistant",
      content: "我将重新生成。[action:claim-chart]"
    });
    const onAction = vi.fn();
    render(<ChatBubble message={msg} onAction={onAction} />);
    const btn = screen.getByTestId("btn-action-msg-action");
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onAction).toHaveBeenCalledWith("claim-chart");
  });
});

describe("ChatPanel", () => {
  beforeEach(() => {
    useChatStore.getState().setSessions([]);
    useChatStore.getState().setMessages([]);
    useChatStore.getState().setActiveSessionId(null);
    useChatStore.getState().setPanelOpen(true);
    const currentCase: PatentCase = {
      id: "test",
      title: "测试案件",
      applicationNumber: "2024100001",
      applicationDate: "2024-01-01",
      patentType: "invention",
      textVersion: "original",
      targetClaimNumber: 1,
      guidelineVersion: "2023",
      reexaminationRound: 1,
      workflowState: "claim-chart-ready",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    useCaseStore.getState().setCurrentCase(currentCase);
  });

  it("无 session 时显示空状态", () => {
    renderChatAt("/cases/test/claim-chart");
    expect(screen.getByText(/开始与 AI 讨论/)).toBeTruthy();
  });

  it("有 session 和消息时渲染气泡", () => {
    const session = makeSession();
    useChatStore.getState().setSessions([session]);
    useChatStore.getState().setMessages([
      makeMessage({ role: "user", content: "特征拆解合理吗？" }),
      makeMessage({ id: "msg-ai", role: "assistant", content: "基本合理" })
    ]);
    useChatStore.getState().setActiveSessionId(session.id);

    renderChatAt("/cases/test/claim-chart");
    expect(screen.getByText("特征拆解合理吗？")).toBeTruthy();
    expect(screen.getByText("基本合理")).toBeTruthy();
  });

  it("折叠面板时不渲染消息", () => {
    useChatStore.getState().setPanelOpen(false);
    renderChatAt("/cases/test/claim-chart");
    expect(screen.queryByTestId("chat-messages")).toBeNull();
  });

  it("新建 session 按钮可用", () => {
    renderChatAt("/cases/test/claim-chart");
    const btn = screen.getByTestId("btn-new-session");
    fireEvent.click(btn);
    const sessions = useChatStore.getState().sessions;
    expect(sessions.length).toBe(1);
    expect(sessions[0]!.moduleScope).toBe("claim-chart");
  });

  it("切换模块后所有 session 仍可见", () => {
    useChatStore.getState().setSessions([
      makeSession({ id: "s1", moduleScope: "claim-chart" }),
      makeSession({ id: "s2", moduleScope: "novelty", title: "新颖性讨论" })
    ]);

    // Render at claim-chart path → both sessions visible
    renderChatAt("/cases/test/claim-chart");
    expect(screen.getByTestId("session-tab-s1")).toBeTruthy();
    expect(screen.getByTestId("session-tab-s2")).toBeTruthy();
  });

  it("切换到 novelty 路径后 session 不消失", () => {
    useChatStore.getState().setSessions([
      makeSession({ id: "s1", moduleScope: "claim-chart" }),
      makeSession({ id: "s2", moduleScope: "novelty", title: "新颖性讨论" })
    ]);

    // Render at novelty path → both sessions still visible
    renderChatAt("/cases/test/novelty");
    expect(screen.getByTestId("session-tab-s1")).toBeTruthy();
    expect(screen.getByTestId("session-tab-s2")).toBeTruthy();
  });
});
