/**
 * Tests for chat history persistence across page refresh scenarios.
 */

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setDBInstance, openPatentDB } from "@client/lib/indexedDb";
import { useChatStore } from "@client/store/features/chat/chatSlice";
import * as chatRepo from "@client/lib/repositories/chatRepo";
import type { ChatSession, ChatMessage } from "@shared/types/domain";

const testCaseId = "test-case-persistence";
const testSessionId = "test-session-persistence";

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: testSessionId,
    caseId: testCaseId,
    moduleScope: "novelty",
    title: "测试聊天会话",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    caseId: testCaseId,
    sessionId: testSessionId,
    moduleScope: "novelty",
    role: "user",
    content: "测试消息",
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

describe("Chat persistence scenarios", () => {
  beforeEach(async () => {
    const db = await openPatentDB();
    setDBInstance(db);

    const storeNames = Array.from(db.objectStoreNames);
    const tx = db.transaction(storeNames, "readwrite");
    await Promise.all([...storeNames.map((s) => tx.objectStore(s).clear()), tx.done]);

    useChatStore.setState({
      sessions: [],
      messages: [],
      activeSessionId: null,
      isPanelOpen: false,
      isLoading: false
    });
  });

  afterEach(async () => {
    try {
      await chatRepo.deleteMessagesBySessionId(testSessionId);
      await chatRepo.deleteSession(testSessionId);
    } catch {
    }
    try {
      await chatRepo.deleteMessagesBySessionId(`${testSessionId}-1`);
      await chatRepo.deleteMessagesBySessionId(`${testSessionId}-2`);
      await chatRepo.deleteSession(`${testSessionId}-1`);
      await chatRepo.deleteSession(`${testSessionId}-2`);
    } catch {
    }
  });
  it("should persist chat session to IndexedDB and retrieve it", async () => {
    const session = makeSession();
    await chatRepo.createSession(session);

    const savedSessions = await chatRepo.getSessionsByCaseId(testCaseId);
    expect(savedSessions).toHaveLength(1);
    expect(savedSessions[0]!.title).toBe("测试聊天会话");
    expect(savedSessions[0]!.moduleScope).toBe("novelty");
  });

  it("should persist chat messages to IndexedDB and retrieve them", async () => {
    const session = makeSession();
    await chatRepo.createSession(session);

    const userMessage = makeMessage({
      id: "msg-user-1",
      role: "user",
      content: "请帮我分析这个技术特征"
    });
    const assistantMessage = makeMessage({
      id: "msg-assistant-1",
      role: "assistant",
      content: "好的，我来分析这个技术特征..."
    });

    await chatRepo.createMessage(userMessage);
    await chatRepo.createMessage(assistantMessage);

    const savedMessages = await chatRepo.getMessagesBySessionId(testSessionId);
    expect(savedMessages).toHaveLength(2);
    const userMsg = savedMessages.find(m => m.role === "user");
    const assistantMsg = savedMessages.find(m => m.role === "assistant");
    expect(userMsg).toBeDefined();
    expect(userMsg!.content).toBe("请帮我分析这个技术特征");
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.content).toBe("好的，我来分析这个技术特征...");
  });

  it("should simulate page refresh: clear store then reload from IndexedDB", async () => {
    const session = makeSession({
      moduleScope: "inventive",
      title: "创造性分析讨论"
    });
    await chatRepo.createSession(session);

    const userMessage = makeMessage({
      id: "msg-refresh-test",
      moduleScope: "inventive",
      content: "页面刷新测试消息"
    });
    await chatRepo.createMessage(userMessage);

    useChatStore.setState({
      sessions: [],
      messages: [],
      activeSessionId: null,
      isPanelOpen: false,
      isLoading: false
    });

    expect(useChatStore.getState().sessions).toHaveLength(0);
    expect(useChatStore.getState().messages).toHaveLength(0);

    const storedSessions = await chatRepo.getSessionsByCaseId(testCaseId);
    useChatStore.getState().loadSessions(storedSessions);

    const allMessages: ChatMessage[] = [];
    for (const s of storedSessions) {
      const msgs = await chatRepo.getMessagesBySessionId(s.id);
      allMessages.push(...msgs);
    }
    useChatStore.getState().loadMessages(allMessages);

    expect(useChatStore.getState().sessions).toHaveLength(1);
    expect(useChatStore.getState().sessions[0]!.title).toBe("创造性分析讨论");
    expect(useChatStore.getState().messages).toHaveLength(1);
    expect(useChatStore.getState().messages[0]!.content).toBe("页面刷新测试消息");
  });

  it("should handle multiple sessions for same case", async () => {
    const session1 = makeSession({
      id: `${testSessionId}-1`,
      title: "新颖性讨论1"
    });
    const session2 = makeSession({
      id: `${testSessionId}-2`,
      title: "新颖性讨论2"
    });

    await chatRepo.createSession(session1);
    await chatRepo.createSession(session2);

    await chatRepo.createMessage({
      id: "msg-s1",
      caseId: testCaseId,
      sessionId: `${testSessionId}-1`,
      moduleScope: "novelty",
      role: "user",
      content: "会话1的消息",
      createdAt: new Date().toISOString()
    });
    await chatRepo.createMessage({
      id: "msg-s2",
      caseId: testCaseId,
      sessionId: `${testSessionId}-2`,
      moduleScope: "novelty",
      role: "user",
      content: "会话2的消息",
      createdAt: new Date().toISOString()
    });

    const sessions = await chatRepo.getSessionsByCaseId(testCaseId);
    expect(sessions).toHaveLength(2);

    const msgs1 = await chatRepo.getMessagesBySessionId(`${testSessionId}-1`);
    expect(msgs1).toHaveLength(1);
    expect(msgs1[0]!.content).toBe("会话1的消息");

    const msgs2 = await chatRepo.getMessagesBySessionId(`${testSessionId}-2`);
    expect(msgs2).toHaveLength(1);
    expect(msgs2[0]!.content).toBe("会话2的消息");
  });
});

describe("Chat persistence: DB schema verification", () => {
  it("chatMessages store should have by-sessionId index for session-scoped queries", async () => {
    const db = await openPatentDB();

    const tx = db.transaction("chatMessages", "readonly");
    const store = tx.objectStore("chatMessages");
    const indexNames: string[] = [];
    for (let i = 0; i < store.indexNames.length; i++) {
      indexNames.push(store.indexNames.item(i)!);
    }
    await tx.done;

    expect(indexNames).toContain("by-sessionId");
    expect(indexNames).toContain("by-caseId");
    expect(indexNames).toContain("by-moduleScope");
    expect(indexNames).toContain("by-createdAt");

    db.close();
  });

  it("chatSessions store should have by-caseId index", async () => {
    const db = await openPatentDB();

    const tx = db.transaction("chatSessions", "readonly");
    const store = tx.objectStore("chatSessions");
    const indexNames: string[] = [];
    for (let i = 0; i < store.indexNames.length; i++) {
      indexNames.push(store.indexNames.item(i)!);
    }
    await tx.done;

    expect(indexNames).toContain("by-caseId");

    db.close();
  });

  it("should be able to query chat messages by session ID via by-sessionId index", async () => {
    const db = await openPatentDB();
    setDBInstance(db);

    const session: ChatSession = {
      id: "schema-verify-session",
      caseId: "schema-verify-case",
      moduleScope: "novelty",
      title: "schema verification",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await chatRepo.createSession(session);

    const msg: ChatMessage = {
      id: "schema-verify-msg",
      caseId: "schema-verify-case",
      sessionId: "schema-verify-session",
      moduleScope: "novelty",
      role: "user",
      content: "schema test",
      createdAt: new Date().toISOString(),
    };
    await chatRepo.createMessage(msg);

    const messages = await chatRepo.getMessagesBySessionId("schema-verify-session");
    expect(messages).toHaveLength(1);
    expect(messages[0]!.content).toBe("schema test");

    await chatRepo.deleteMessagesBySessionId("schema-verify-session");
    await chatRepo.deleteSession("schema-verify-session");
    db.close();
  });
});