/**
 * 一键演示数据路由（demoRouter）
 *
 * 为前端"一键演示"提供数据播种能力：把源案件（case-1780745308399，
 * 全链路数据最完整的真实案件）的数据按业务步骤深拷贝到新创建的演示案件，
 * 全程只读写本地 DB，不调用任何外部 API。
 *
 * 端点：
 * - POST /api/demo/cleanup-stale  清理遗留演示案件（标题以【演示】开头）
 * - POST /api/demo/adopt          把刚创建的空案件标记为演示案件（设置标题）
 * - POST /api/demo/seed           按步骤拷贝源案件数据（ID 全部重映射）
 * - DELETE /api/demo/case/:id     删除演示案件及其全部关联数据
 */
import express from "express";
import { getSyncDb } from "../lib/syncDb.js";
import { logger } from "../lib/logger.js";

export const demoRouter = express.Router();

/** 源案件：数据库中全链路数据最完整的真实案件（演示的数据来源，只读） */
const SOURCE_CASE_ID = "case-1780745308399";
/**
 * Chat 演示源案件：包含"2026年以来中国和美国最新的专利法规有什么更新？"
 * 优质问答（assistant 消息带 mergedCitations 引用清单），用于演示随案 Chat 的引用展示。
 */
const CHAT_SOURCE_CASE_ID = "case-1780838330186";
/** 演示案件标题前缀（用于识别和清理遗留演示数据） */
export const DEMO_TITLE_PREFIX = "【演示】";

/** 存放案件关联数据的所有 store */
const CASE_STORES = [
  "documents",
  "claimNodes",
  "claimCharts",
  "novelty",
  "inventive",
  "defects",
  "opinionAnalyses",
  "argumentMappings",
  "reexamDrafts",
  "summaries",
  "interpretSummaries",
  "runMarkers",
  "searchSessions",
  "chatSessions",
  "chatMessages",
] as const;

const SEED_STEPS = [
  "case-fields",
  "documents",
  "interpret",
  "opinion",
  "references",
  "claim-chart",
  "novelty",
  "inventive",
  "defects",
  "draft",
  "summary",
  "chat",
] as const;

type SeedStep = (typeof SEED_STEPS)[number];

interface SourceRecord {
  id: string;
  data: Record<string, unknown>;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 选出源案件在某个 store 的全部记录（record_id 或 data 中含源案件 ID） */
function selectSourceRecords(store: string): SourceRecord[] {
  const db = getSyncDb();
  const rows = db
    .prepare(
      "SELECT record_id, data FROM sync_data WHERE store_name = ? AND (record_id LIKE ? OR data LIKE ?)"
    )
    .all(store, `%${SOURCE_CASE_ID}%`, `%${SOURCE_CASE_ID}%`) as Array<{
    record_id: string;
    data: string;
  }>;
  const out: SourceRecord[] = [];
  for (const row of rows) {
    try {
      out.push({ id: row.record_id, data: JSON.parse(row.data) as Record<string, unknown> });
    } catch {
      // 跳过损坏记录
    }
  }
  return out;
}

/**
 * 构建 ID 重映射表：源案件 ID → 演示案件 ID；
 * 每条记录的旧 record_id → 新 record_id（含源案件 ID 的做替换，不含的加演示案件前缀）。
 * 映射对同一演示案件是确定性的，可跨多个 seed 步骤保持引用一致。
 */
function buildIdMap(newCaseId: string): Map<string, string> {
  const map = new Map<string, string>([[SOURCE_CASE_ID, newCaseId]]);
  for (const store of CASE_STORES) {
    for (const rec of selectSourceRecords(store)) {
      if (!map.has(rec.id)) {
        map.set(
          rec.id,
          rec.id.includes(SOURCE_CASE_ID)
            ? rec.id.split(SOURCE_CASE_ID).join(newCaseId)
            : `${newCaseId}--${rec.id}`
        );
      }
    }
  }
  return map;
}

/** 对记录做深拷贝并重映射所有 ID 引用（长 ID 优先替换，避免子串误伤） */
function remapRecord(record: SourceRecord, idMap: Map<string, string>): SourceRecord {
  const sorted = [...idMap.entries()].sort((a, b) => b[0].length - a[0].length);
  let json = JSON.stringify(record.data);
  for (const [oldId, newId] of sorted) {
    if (json.includes(oldId)) json = json.split(oldId).join(newId);
  }
  const newId = idMap.get(record.id) ?? `${idMap.get(SOURCE_CASE_ID)}--${record.id}`;
  return { id: newId, data: JSON.parse(json) as Record<string, unknown> };
}

function insertRecord(store: string, rec: SourceRecord): void {
  const db = getSyncDb();
  db.prepare(
    "INSERT OR REPLACE INTO sync_data (store_name, record_id, data, updated_at) VALUES (?, ?, ?, datetime('now','localtime'))"
  ).run(store, rec.id, JSON.stringify(rec.data));
}

/** 按步骤筛选源案件记录并拷贝到演示案件，返回拷贝条数 */
function seedStepRecords(step: SeedStep, idMap: Map<string, string>): number {
  const copy = (store: string, filter?: (r: SourceRecord) => boolean): number =>
    copySourceRecords(store, idMap, filter);

  const markerIs = (name: string) => (r: SourceRecord) => r.id.endsWith(`::${name}`);

  switch (step) {
    case "documents":
      // 全量拷贝（含对比文件），与源案件复审文件导入页保持一致
      return copy("documents");
    case "interpret":
      return copy("interpretSummaries");
    case "opinion":
      return copy("opinionAnalyses") + copy("argumentMappings");
    case "references":
      // 对比文件已随 documents 步骤拷贝；此处补种 AI 检索会话（检索式 + 各引擎结果）
      return copy("searchSessions");
    case "claim-chart":
      return copy("claimNodes") + copy("claimCharts") + copy("runMarkers", markerIs("claimChart"));
    case "novelty":
      return copy("novelty");
    case "inventive":
      return copy("inventive");
    case "defects":
      return copy("defects") + copy("runMarkers", markerIs("defects"));
    case "draft":
      return copy("reexamDrafts");
    case "summary":
      return copy("summaries");
    case "chat":
      // 由 seedChatQaFromSource 专门处理（数据源是 CHAT_SOURCE_CASE_ID）
      return 0;
    default:
      return 0;
  }
}

/** 拷贝源案件某 store 的记录（可筛选）到演示案件，返回拷贝条数 */
function copySourceRecords(
  store: string,
  idMap: Map<string, string>,
  filter?: (r: SourceRecord) => boolean
): number {
  const records = selectSourceRecords(store).filter((r) => (filter ? filter(r) : true));
  for (const rec of records) insertRecord(store, remapRecord(rec, idMap));
  return records.length;
}

/**
 * Chat 步骤播种：从 CHAT_SOURCE_CASE_ID 的随案会话中挑选
 * 最后一条"非空且带引用清单"的 assistant 回答及其对应的 user 提问，
 * 重映射 ID 后写入演示案件，让观众看到完整的问答 + citation list。
 */
function seedChatQaFromSource(newCaseId: string): number {
  const db = getSyncDb();
  const sessionRows = db
    .prepare(
      "SELECT record_id, data FROM sync_data WHERE store_name = 'chatSessions' AND data LIKE ?"
    )
    .all(`%${CHAT_SOURCE_CASE_ID}%`) as Array<{ record_id: string; data: string }>;

  // 优先选 case 域会话（随案助手），没有则退而求其次
  let session: SourceRecord | null = null;
  for (const row of sessionRows) {
    try {
      const data = JSON.parse(row.data) as Record<string, unknown>;
      if (data.moduleScope === "case") {
        session = { id: row.record_id, data };
        break;
      }
      session ??= { id: row.record_id, data };
    } catch {
      // 跳过损坏记录
    }
  }
  if (!session) {
    logger.warn(`Demo seed chat: 源案件 ${CHAT_SOURCE_CASE_ID} 无聊天会话`);
    return 0;
  }

  const msgRows = db
    .prepare(
      "SELECT record_id, data FROM sync_data WHERE store_name = 'chatMessages' AND data LIKE ?"
    )
    .all(`%${session.id}%`) as Array<{ record_id: string; data: string }>;
  const messages: SourceRecord[] = [];
  for (const row of msgRows) {
    try {
      messages.push({ id: row.record_id, data: JSON.parse(row.data) as Record<string, unknown> });
    } catch {
      // 跳过损坏记录
    }
  }
  // 按 record_id 中的时间戳排序（msg-<ts>-<role>）
  messages.sort((a, b) => a.id.localeCompare(b.id));

  // 最后一条非空且带引用的 assistant 消息
  let assistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (
      m.data.role === "assistant" &&
      typeof m.data.content === "string" &&
      m.data.content.trim().length > 0 &&
      Array.isArray(m.data.mergedCitations) &&
      (m.data.mergedCitations as unknown[]).length > 0
    ) {
      assistantIdx = i;
      break;
    }
  }
  if (assistantIdx < 0) {
    logger.warn(`Demo seed chat: 会话 ${session.id} 无带引用的 assistant 消息`);
    return 0;
  }
  // 它前面最近的一条 user 提问
  let userIdx = -1;
  for (let i = assistantIdx - 1; i >= 0; i--) {
    if (messages[i]!.data.role === "user") {
      userIdx = i;
      break;
    }
  }

  const picked: SourceRecord[] = [];
  if (userIdx >= 0) picked.push(messages[userIdx]!);
  picked.push(messages[assistantIdx]!);

  // ID 重映射：源案件 ID → 演示案件 ID；会话/消息 ID 同步替换
  const newSessionId = session.id.split(CHAT_SOURCE_CASE_ID).join(newCaseId);
  const remapText = (text: string): string =>
    text.split(CHAT_SOURCE_CASE_ID).join(newCaseId).split(session.id).join(newSessionId);

  // 时间戳调成"刚刚发送"，配合演示里"提问 → 生成中 → 回答出现"的节奏
  const now = Date.now();
  const sessionData = JSON.parse(remapText(JSON.stringify(session.data))) as Record<string, unknown>;
  sessionData.createdAt = new Date(now - 120_000).toISOString();
  sessionData.updatedAt = new Date(now).toISOString();
  insertRecord("chatSessions", { id: newSessionId, data: sessionData });

  picked.forEach((rec, i) => {
    const data = JSON.parse(remapText(JSON.stringify(rec.data))) as Record<string, unknown>;
    data.sessionId = newSessionId;
    data.caseId = newCaseId;
    data.createdAt = new Date(now - (picked.length - i) * 5_000).toISOString();
    const newId = rec.id.includes(CHAT_SOURCE_CASE_ID)
      ? rec.id.split(CHAT_SOURCE_CASE_ID).join(newCaseId)
      : `${newCaseId}--${rec.id}`;
    insertRecord("chatMessages", { id: newId, data });
  });

  return picked.length + 1;
}

/** 删除某案件的全部关联数据 + 案件记录本身，返回删除条数（不含案件记录） */
function deleteCaseEcosystem(caseId: string): number {
  const db = getSyncDb();
  let removed = 0;
  for (const store of CASE_STORES) {
    const r = db
      .prepare("DELETE FROM sync_data WHERE store_name = ? AND (record_id LIKE ? OR data LIKE ?)")
      .run(store, `%${caseId}%`, `%${caseId}%`);
    removed += r.changes;
  }
  db.prepare("DELETE FROM sync_data WHERE store_name = 'cases' AND record_id = ?").run(caseId);
  return removed;
}

function readCaseRecord(caseId: string): Record<string, unknown> | null {
  const db = getSyncDb();
  const row = db
    .prepare("SELECT data FROM sync_data WHERE store_name = 'cases' AND record_id = ?")
    .get(caseId) as { data: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function writeCaseRecord(caseId: string, data: Record<string, unknown>): void {
  const db = getSyncDb();
  db.prepare(
    "INSERT OR REPLACE INTO sync_data (store_name, record_id, data, updated_at) VALUES ('cases', ?, ?, datetime('now','localtime'))"
  ).run(caseId, JSON.stringify(data));
}

// ── POST /api/demo/cleanup-stale — 清理遗留演示案件 ─────────────────────
demoRouter.post("/demo/cleanup-stale", (_req, res) => {
  try {
    const db = getSyncDb();
    const rows = db
      .prepare("SELECT record_id, data FROM sync_data WHERE store_name = 'cases' AND data LIKE ?")
      .all(`%${DEMO_TITLE_PREFIX}%`) as Array<{ record_id: string; data: string }>;
    let removed = 0;
    for (const row of rows) {
      try {
        const data = JSON.parse(row.data) as { title?: string };
        if (typeof data.title === "string" && data.title.startsWith(DEMO_TITLE_PREFIX)) {
          removed += deleteCaseEcosystem(row.record_id) + 1;
        }
      } catch {
        // 跳过损坏记录
      }
    }
    res.json({ ok: true, removed });
  } catch (err) {
    logger.error("Demo cleanup-stale error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

// ── POST /api/demo/adopt — 把刚创建的空案件标记为演示案件 ────────────────
demoRouter.post("/demo/adopt", (req, res) => {
  try {
    const caseId = typeof req.body?.caseId === "string" ? req.body.caseId : "";
    if (!caseId) {
      res.status(400).json({ ok: false, error: "caseId 必填" });
      return;
    }
    const record = readCaseRecord(caseId);
    if (!record) {
      res.status(404).json({ ok: false, error: "案件不存在" });
      return;
    }
    const source = readCaseRecord(SOURCE_CASE_ID);
    if (!source) {
      res.status(412).json({ ok: false, error: `源案件 ${SOURCE_CASE_ID} 不存在，无法播种演示数据` });
      return;
    }
    const sourceTitle = typeof source.title === "string" && source.title ? source.title : "复审案件";
    record.title = `${DEMO_TITLE_PREFIX}${sourceTitle.replace(/-mimo$/, "")}`;
    writeCaseRecord(caseId, record);
    res.json({ ok: true, title: record.title });
  } catch (err) {
    logger.error("Demo adopt error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

// ── POST /api/demo/seed — 按步骤拷贝源案件数据 ──────────────────────────
demoRouter.post("/demo/seed", (req, res) => {
  try {
    const caseId = typeof req.body?.caseId === "string" ? req.body.caseId : "";
    const step = req.body?.step as SeedStep;
    if (!caseId || !SEED_STEPS.includes(step)) {
      res.status(400).json({ ok: false, error: `caseId 必填，step 必须是: ${SEED_STEPS.join("/")}` });
      return;
    }
    if (!readCaseRecord(caseId)) {
      res.status(404).json({ ok: false, error: "案件不存在" });
      return;
    }
    if (!readCaseRecord(SOURCE_CASE_ID)) {
      res.status(412).json({ ok: false, error: `源案件 ${SOURCE_CASE_ID} 不存在` });
      return;
    }

    // case-fields：拷贝源案件的表单字段（申请号/申请人/申请日等），保留演示案件的 id 与标题
    if (step === "case-fields") {
      const source = readCaseRecord(SOURCE_CASE_ID)!;
      const current = readCaseRecord(caseId)!;
      const merged: Record<string, unknown> = {
        ...source,
        id: caseId,
        title: current.title,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString(),
      };
      writeCaseRecord(caseId, merged);
      // 真实流程中「AI 提取」会同时从申请文件解析出权利要求节点，这里一并播种，
      // 后续「文献清单」页的 AI 辅助检索面板依赖权利要求文本才会渲染
      const idMap = buildIdMap(caseId);
      const claims = copySourceRecords("claimNodes", idMap);
      res.json({ ok: true, copied: 1 + claims });
      return;
    }

    // chat：从 Chat 源案件拷贝"2026 专利法规更新"问答（含引用清单）
    if (step === "chat") {
      const copied = seedChatQaFromSource(caseId);
      res.json({ ok: true, copied });
      return;
    }

    const idMap = buildIdMap(caseId);
    const copied = seedStepRecords(step, idMap);
    res.json({ ok: true, copied });
  } catch (err) {
    logger.error("Demo seed error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

// ── DELETE /api/demo/case/:id — 删除演示案件及其全部关联数据 ─────────────
demoRouter.delete("/demo/case/:id", (req, res) => {
  try {
    const caseId = req.params.id;
    if (!caseId || caseId === SOURCE_CASE_ID) {
      res.status(400).json({ ok: false, error: "非法案件 ID" });
      return;
    }
    const removed = deleteCaseEcosystem(caseId);
    res.json({ ok: true, removed });
  } catch (err) {
    logger.error("Demo delete error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});
