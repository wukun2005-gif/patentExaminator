/**
 * IndexedDB Schema Verification Tests
 * ==========================================
 *
 * 验证当前 v7 schema 的完整性，防止 lesson-learned-57
 * 中的索引缺失问题再次发生。
 *
 * 注意：vitest + happy-dom + fake-indexeddb 环境下
 * deleteDatabase 容易被阻塞（超时），因此不模拟
 * DB 版本升级过程。实际升级路径由以下方式验证：
 *   1. scripts/verify-indexeddb-schema.sh 自动化脚本
 *   2. standalone Node.js 升级模拟脚本
 *
 * 覆盖：
 *   1. 当前 v7 schema 的 store 完整性
 *   2. 当前 v7 schema 的索引完整性
 *   3. by-sessionId 索引的功能性验证
 */

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setDBInstance } from "@client/lib/indexedDb";
import {
  assertAllStoreIndexes,
  formatIndexCheckErrors,
  EXPECTED_SCHEMA_V7,
} from "../helpers/dbAssert";
import * as chatRepo from "@client/lib/repositories/chatRepo";
import * as caseRepo from "@client/lib/repositories/caseRepo";
import type { ChatSession, ChatMessage, PatentCase } from "@shared/types/domain";

const CURRENT_VERSION = 7;

function makeCase(overrides: Partial<PatentCase> = {}): PatentCase {
  return {
    id: "schema-case-1",
    applicationNumber: "CN2023100000001",
    title: "Schema 测试案件",
    applicationDate: "2023-01-01",
    patentType: "invention",
    textVersion: "original",
    targetClaimNumber: 1,
    guidelineVersion: "2023",
    reexaminationRound: 1,
    workflowState: "empty",
    createdAt: "2023-01-01T00:00:00.000Z",
    updatedAt: "2023-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: "schema-session-1",
    caseId: "schema-case-1",
    moduleScope: "novelty",
    title: "Schema 测试会话",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "schema-msg-1",
    caseId: "schema-case-1",
    sessionId: "schema-session-1",
    moduleScope: "novelty",
    role: "user",
    content: "Schema 测试消息",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("IndexedDB Schema Verification (v7)", () => {
  describe("Store 完整性", () => {
    it("should have all expected stores in v7 schema", async () => {
      const { openPatentDB } = await import("@client/lib/indexedDb");
      const db = await openPatentDB();
      setDBInstance(db);

      const storeList: string[] = [];
      for (let i = 0; i < db.objectStoreNames.length; i++) {
        storeList.push(db.objectStoreNames.item(i)!);
      }

      for (const name of Object.keys(EXPECTED_SCHEMA_V7)) {
        expect(storeList).toContain(name);
      }

      db.close();
    });

    it("should have expected indexes on all stores in v7 schema", async () => {
      const { openPatentDB } = await import("@client/lib/indexedDb");
      const db = await openPatentDB();
      setDBInstance(db);

      const results = await assertAllStoreIndexes(db, EXPECTED_SCHEMA_V7);
      const failed = results.filter((r) => !r.pass);

      if (failed.length > 0) {
        const errorMsg = formatIndexCheckErrors(results);
        // eslint-disable-next-line no-console
        console.error(errorMsg);
      }

      for (const result of results) {
        expect(
          result.pass,
          `Store "${result.storeName}" index mismatch\n` +
            `  Missing: [${result.missing.join(", ")}]\n` +
            `  Extra: [${result.extra.join(", ")}]\n` +
            `  Actual: [${result.actual.join(", ")}]\n` +
            `  Expected: [${result.expected.join(", ")}]`
        ).toBe(true);
      }

      db.close();
    });

    it("should have CURRENT_VERSION = 7", () => {
      expect(CURRENT_VERSION).toBe(7);
    });
  });

  describe("chatMessages schema (by-sessionId)", () => {
    it("chatMessages store should have by-sessionId index", async () => {
      const { openPatentDB } = await import("@client/lib/indexedDb");
      const db = await openPatentDB();
      setDBInstance(db);

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

    it("should be able to query messages by sessionId via by-sessionId index", async () => {
      const { openPatentDB } = await import("@client/lib/indexedDb");
      const db = await openPatentDB();
      setDBInstance(db);

      await chatRepo.createSession(makeSession());
      await chatRepo.createMessage(makeMessage());

      const messages = await chatRepo.getMessagesBySessionId("schema-session-1");
      expect(messages).toHaveLength(1);
      expect(messages[0]!.content).toBe("Schema 测试消息");
      expect(messages[0]!.sessionId).toBe("schema-session-1");

      await chatRepo.deleteMessagesBySessionId("schema-session-1");
      await chatRepo.deleteSession("schema-session-1");
      db.close();
    });
  });

  describe("数据完整性", () => {
    beforeEach(async () => {
      const { openPatentDB } = await import("@client/lib/indexedDb");
      const db = await openPatentDB();
      setDBInstance(db);
    });

    afterEach(async () => {
      try {
        await chatRepo.deleteMessagesBySessionId("schema-session-1");
        await chatRepo.deleteSession("schema-session-1");
      } catch {}
      try {
        await caseRepo.deleteCase("schema-case-1");
      } catch {}
    });

    it("should preserve case data through DB operations", async () => {
      await caseRepo.createCase(makeCase());
      const cases = await caseRepo.readAllCases();
      expect(cases.length).toBeGreaterThanOrEqual(1);
      expect(cases.some((c) => c.id === "schema-case-1")).toBe(true);
    });

    it("should preserve chat session and message data through DB operations", async () => {
      await chatRepo.createSession(makeSession());
      await chatRepo.createMessage(makeMessage());

      const sessions = await chatRepo.getSessionsByCaseId("schema-case-1");
      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.title).toBe("Schema 测试会话");

      const messages = await chatRepo.getMessagesBySessionId("schema-session-1");
      expect(messages).toHaveLength(1);
      expect(messages[0]!.content).toBe("Schema 测试消息");
    });
  });
});