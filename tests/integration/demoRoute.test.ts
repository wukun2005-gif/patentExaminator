/**
 * 演示路由（/api/demo/*）集成测试
 *
 * 覆盖：
 * - adopt：标记演示案件标题；源案件缺失时 412
 * - seed documents：深拷贝全部文档（含 reference 对比文件），ID 全部重映射，源案件记录不变
 * - seed references：只补种 searchSessions（对比文件已随 documents 拷贝）
 * - seed claim-chart：claimNodes/claimCharts/runMarkers 拷贝且引用重映射
 * - seed case-fields：拷贝表单字段但保留演示案件 id/title；同时播种 claimNodes
 * - seed chat：从 Chat 源案件（case-1780838330186）挑选带引用清单的问答对拷贝，sessionId 引用重映射
 * - DELETE /demo/case/:id：删除演示案件全部数据且不影响源案件
 * - cleanup-stale：清理【演示】标题案件
 *
 * 隔离：beforeAll 注入 :memory: 数据库，绝不触碰生产 DB（B-042）。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type supertest from "supertest";
import { resetSyncDbForTesting } from "@server/lib/syncDb.js";

const SOURCE_CASE_ID = "case-1780745308399";
const CHAT_SOURCE_CASE_ID = "case-1780838330186";
const DEMO_CASE_ID = "case-demo-test-001";

let app: import("express-serve-static-core").Express;
let db: ReturnType<typeof import("@server/lib/syncDb.js").getSyncDb>;
let request: typeof supertest;

function insertRecord(store: string, id: string, data: unknown) {
  db.prepare(
    "INSERT OR REPLACE INTO sync_data (store_name, record_id, data, updated_at) VALUES (?, ?, ?, datetime('now','localtime'))"
  ).run(store, id, JSON.stringify(data));
}

function getRecord(store: string, id: string): Record<string, unknown> | null {
  const row = db
    .prepare("SELECT data FROM sync_data WHERE store_name = ? AND record_id = ?")
    .get(store, id) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as Record<string, unknown>) : null;
}

function countRecords(store: string, like: string): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS c FROM sync_data WHERE store_name = ? AND (record_id LIKE ? OR data LIKE ?)"
    )
    .get(store, `%${like}%`, `%${like}%`) as { c: number };
  return row.c;
}

beforeAll(async () => {
  // B-042: 必须在 import 路由之前注入内存数据库
  resetSyncDbForTesting(":memory:");
  const { getSyncDb } = await import("@server/lib/syncDb.js");
  db = getSyncDb();

  const express = (await import("express")).default;
  const { demoRouter } = await import("@server/routes/demo.js");
  app = express();
  app.use(express.json());
  app.use("/api", demoRouter);
  request = (await import("supertest")).default;

  // ── 构造源案件最小数据集 ─────────────────────────────
  insertRecord("cases", SOURCE_CASE_ID, {
    id: SOURCE_CASE_ID,
    title: "一种基于相变材料的LED散热模组-mimo",
    applicationNumber: "202410567890.1",
    applicant: "深圳光明科技有限公司",
    applicationDate: "2024-05-10",
    workflowState: "case-ready",
  });
  insertRecord("documents", "doc-aaa", {
    id: "doc-aaa",
    caseId: SOURCE_CASE_ID,
    role: "office-action",
    fileName: "第一次审查意见通知书.pdf",
  });
  insertRecord("documents", "candidate-bbb", {
    id: "candidate-bbb",
    caseId: SOURCE_CASE_ID,
    role: "reference",
    fileName: "CN203464217U.pdf",
  });
  insertRecord("claimNodes", `${SOURCE_CASE_ID}-claim-1`, {
    id: `${SOURCE_CASE_ID}-claim-1`,
    caseId: SOURCE_CASE_ID,
    claimNumber: 1,
  });
  insertRecord("claimCharts", `${SOURCE_CASE_ID}-chart-1-A`, {
    id: `${SOURCE_CASE_ID}-chart-1-A`,
    caseId: SOURCE_CASE_ID,
    claimNodeId: `${SOURCE_CASE_ID}-claim-1`,
    featureCode: "A",
  });
  insertRecord("runMarkers", `${SOURCE_CASE_ID}::claimChart`, {
    caseId: SOURCE_CASE_ID,
    agent: "claimChart",
  });
  insertRecord("chatSessions", `chat-${SOURCE_CASE_ID}-s1`, {
    id: `chat-${SOURCE_CASE_ID}-s1`,
    caseId: SOURCE_CASE_ID,
    title: "案件讨论",
  });
  insertRecord("chatMessages", "msg-u1", {
    id: "msg-u1",
    caseId: SOURCE_CASE_ID,
    sessionId: `chat-${SOURCE_CASE_ID}-s1`,
    role: "user",
    content: "复审案件还需要哪些文件和信息",
  });
  // ── Chat 源案件（case-1780838330186）：带引用清单的"2026 专利法规更新"问答 ──
  insertRecord("chatSessions", `chat-${CHAT_SOURCE_CASE_ID}-s1`, {
    id: `chat-${CHAT_SOURCE_CASE_ID}-s1`,
    caseId: CHAT_SOURCE_CASE_ID,
    moduleScope: "case",
    title: "案件 讨论",
  });
  insertRecord("chatMessages", "msg-1784446241443-user", {
    id: "msg-1784446241443-user",
    caseId: CHAT_SOURCE_CASE_ID,
    sessionId: `chat-${CHAT_SOURCE_CASE_ID}-s1`,
    role: "user",
    content: "2026年以来中国和美国最新的专利法规有什么更新？",
    createdAt: "2026-07-19T07:30:00.000Z",
  });
  insertRecord("chatMessages", "msg-1784446405063-assistant", {
    id: "msg-1784446405063-assistant",
    caseId: CHAT_SOURCE_CASE_ID,
    sessionId: `chat-${CHAT_SOURCE_CASE_ID}-s1`,
    role: "assistant",
    content: "2026年以来，中国和美国在专利法规方面均有重要更新 [1][2]。",
    mergedCitations: [
      { title: "新修改《专利审查指南》将于2026年施行", url: "https://example.com/a", snippet: "……" },
      { title: "2026年USPTO新规", url: "https://example.com/b", snippet: "……" },
    ],
    createdAt: "2026-07-19T07:33:25.063Z",
  });
  // 演示案件（空）
  insertRecord("cases", DEMO_CASE_ID, {
    id: DEMO_CASE_ID,
    title: "",
    workflowState: "empty",
  });
});

afterAll(async () => {
  const { closeSyncDb } = await import("@server/lib/syncDb.js");
  closeSyncDb();
});

describe("POST /api/demo/adopt", () => {
  it("标记演示案件标题（去 -mimo 后缀，加【演示】前缀）", async () => {
    const res = await request(app).post("/api/demo/adopt").send({ caseId: DEMO_CASE_ID });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const record = getRecord("cases", DEMO_CASE_ID);
    expect(record?.title).toBe("【演示】一种基于相变材料的LED散热模组");
  });

  it("案件不存在返回 404", async () => {
    const res = await request(app).post("/api/demo/adopt").send({ caseId: "case-nonexistent" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/demo/seed", () => {
  it("documents：全量拷贝（含 reference 对比文件），ID 重映射，源记录不变", async () => {
    const res = await request(app)
      .post("/api/demo/seed")
      .send({ caseId: DEMO_CASE_ID, step: "documents" });
    expect(res.status).toBe(200);
    expect(res.body.copied).toBe(2); // doc-aaa + candidate-bbb 都拷贝

    const copied = getRecord("documents", `${DEMO_CASE_ID}--doc-aaa`);
    expect(copied).not.toBeNull();
    expect(copied?.caseId).toBe(DEMO_CASE_ID);
    expect(copied?.fileName).toBe("第一次审查意见通知书.pdf");
    // 对比文件一并拷贝（与源案件复审文件导入页保持一致）
    const copiedRef = getRecord("documents", `${DEMO_CASE_ID}--candidate-bbb`);
    expect(copiedRef).not.toBeNull();
    expect(copiedRef?.caseId).toBe(DEMO_CASE_ID);
    expect(copiedRef?.role).toBe("reference");
    // 源记录未被修改
    const source = getRecord("documents", "doc-aaa");
    expect(source?.caseId).toBe(SOURCE_CASE_ID);
  });

  it("references：只补种 searchSessions（对比文件已随 documents 拷贝）", async () => {
    insertRecord("searchSessions", `search-${SOURCE_CASE_ID}-1`, {
      id: `search-${SOURCE_CASE_ID}-1`,
      caseId: SOURCE_CASE_ID,
      searchTerms: ["散热"],
    });
    const res = await request(app)
      .post("/api/demo/seed")
      .send({ caseId: DEMO_CASE_ID, step: "references" });
    expect(res.body.copied).toBe(1);
    expect(getRecord("searchSessions", `search-${DEMO_CASE_ID}-1`)?.caseId).toBe(DEMO_CASE_ID);
  });

  it("claim-chart：claimNode/claimChart/runMarker 拷贝且跨记录引用重映射", async () => {
    const res = await request(app)
      .post("/api/demo/seed")
      .send({ caseId: DEMO_CASE_ID, step: "claim-chart" });
    expect(res.body.copied).toBe(3);

    const chart = getRecord("claimCharts", `${DEMO_CASE_ID}-chart-1-A`);
    expect(chart).not.toBeNull();
    expect(chart?.caseId).toBe(DEMO_CASE_ID);
    // claimNodeId 引用必须重映射到新的 claimNode id
    expect(chart?.claimNodeId).toBe(`${DEMO_CASE_ID}-claim-1`);
    expect(getRecord("claimNodes", `${DEMO_CASE_ID}-claim-1`)).not.toBeNull();
    expect(getRecord("runMarkers", `${DEMO_CASE_ID}::claimChart`)).not.toBeNull();
  });

  it("case-fields：拷贝表单字段但保留演示案件 id/title，并播种 claimNodes", async () => {
    const res = await request(app)
      .post("/api/demo/seed")
      .send({ caseId: DEMO_CASE_ID, step: "case-fields" });
    expect(res.status).toBe(200);
    const record = getRecord("cases", DEMO_CASE_ID);
    expect(record?.id).toBe(DEMO_CASE_ID);
    expect(record?.title).toBe("【演示】一种基于相变材料的LED散热模组");
    expect(record?.applicationNumber).toBe("202410567890.1");
    expect(record?.applicant).toBe("深圳光明科技有限公司");
    expect(record?.workflowState).toBe("case-ready");
    // 真实「AI 提取」会同时解析出权利要求节点，case-fields 步骤一并播种
    expect(getRecord("claimNodes", `${DEMO_CASE_ID}-claim-1`)?.caseId).toBe(DEMO_CASE_ID);
    // 源案件不变
    expect(getRecord("cases", SOURCE_CASE_ID)?.title).toContain("-mimo");
  });

  it("chat：从 Chat 源案件拷贝带引用清单的问答对，sessionId 引用重映射", async () => {
    const res = await request(app)
      .post("/api/demo/seed")
      .send({ caseId: DEMO_CASE_ID, step: "chat" });
    // 1 个会话 + user 提问 + assistant 回答
    expect(res.body.copied).toBe(3);

    const newSessionId = `chat-${DEMO_CASE_ID}-s1`;
    const session = getRecord("chatSessions", newSessionId);
    expect(session).not.toBeNull();
    expect(session?.caseId).toBe(DEMO_CASE_ID);

    // user 提问与 assistant 回答都重映射到演示案件，且挂在同一会话下
    const userMsg = getRecord("chatMessages", `${DEMO_CASE_ID}--msg-1784446241443-user`);
    expect(userMsg?.caseId).toBe(DEMO_CASE_ID);
    expect(userMsg?.sessionId).toBe(newSessionId);
    expect(userMsg?.content).toBe("2026年以来中国和美国最新的专利法规有什么更新？");

    const assistantMsg = getRecord("chatMessages", `${DEMO_CASE_ID}--msg-1784446405063-assistant`);
    expect(assistantMsg?.sessionId).toBe(newSessionId);
    // 引用清单完整保留（citation list 是本次演示的核心展示点）
    expect(Array.isArray(assistantMsg?.mergedCitations)).toBe(true);
    expect((assistantMsg?.mergedCitations as unknown[]).length).toBe(2);
    // Chat 源案件的记录保持不变
    expect(getRecord("chatMessages", "msg-1784446405063-assistant")?.caseId).toBe(CHAT_SOURCE_CASE_ID);
  });

  it("拒绝非法 step", async () => {
    const res = await request(app)
      .post("/api/demo/seed")
      .send({ caseId: DEMO_CASE_ID, step: "evil" });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/demo/case/:id", () => {
  it("删除演示案件全部数据，源案件不受影响", async () => {
    // 先确认演示数据存在
    expect(countRecords("documents", DEMO_CASE_ID)).toBeGreaterThan(0);

    const res = await request(app).delete(`/api/demo/case/${DEMO_CASE_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.removed).toBeGreaterThan(0);

    expect(getRecord("cases", DEMO_CASE_ID)).toBeNull();
    expect(countRecords("documents", DEMO_CASE_ID)).toBe(0);
    expect(countRecords("claimCharts", DEMO_CASE_ID)).toBe(0);
    expect(countRecords("chatMessages", DEMO_CASE_ID)).toBe(0);
    // 源案件数据完好
    expect(getRecord("cases", SOURCE_CASE_ID)).not.toBeNull();
    expect(getRecord("documents", "doc-aaa")).not.toBeNull();
  });

  it("拒绝删除源案件", async () => {
    const res = await request(app).delete(`/api/demo/case/${SOURCE_CASE_ID}`);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/demo/cleanup-stale", () => {
  it("清理所有【演示】标题案件", async () => {
    insertRecord("cases", "case-demo-stale-1", { id: "case-demo-stale-1", title: "【演示】遗留案件" });
    insertRecord("documents", "case-demo-stale-1--doc-x", {
      id: "case-demo-stale-1--doc-x",
      caseId: "case-demo-stale-1",
      role: "application",
    });
    const res = await request(app).post("/api/demo/cleanup-stale");
    expect(res.status).toBe(200);
    expect(getRecord("cases", "case-demo-stale-1")).toBeNull();
    expect(countRecords("documents", "case-demo-stale-1")).toBe(0);
    // 非演示案件不受影响
    expect(getRecord("cases", SOURCE_CASE_ID)).not.toBeNull();
  });
});
