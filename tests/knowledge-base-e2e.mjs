/**
 * 知识库 RAG 系统 E2E 测试
 * =========================
 *
 * 测试覆盖：
 * - T-RAG-001: 测试数据文件完整性
 * - T-RAG-002~008: 各格式文件有效性验证
 * - T-RAG-009~012: 代码结构验证
 * - T-RAG-013~022: 类型/schema/配置验证
 * - T-RAG-023~025: 端到端集成测试
 *
 * Usage:
 *   node tests/knowledge-base-e2e.mjs
 *
 * 测试隔离：使用独立的 SQLite 数据库，不污染用户数据
 */

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SAMPLES_DIR = path.join(ROOT, "samples", "knowledge-base");
const CLIENT_SRC = path.join(ROOT, "client", "src");
const SHARED_SRC = path.join(ROOT, "shared", "src");

// 测试隔离：使用临时目录作为数据库路径
const TEST_DB_DIR = path.join(os.tmpdir(), `patent-examiner-test-${Date.now()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "knowledge.db");
const TEST_PORT = 3099;
const BASE = `http://localhost:${TEST_PORT}/api`;

let serverProcess = null;

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function fileExists(p) {
  return fs.existsSync(p);
}

function readFile(p) {
  return fs.readFileSync(p, "utf-8");
}

/** 上传文件到知识库并返回最终结果 */
async function uploadKnowledgeFile(fileName) {
  const filePath = path.join(SAMPLES_DIR, fileName);
  const buffer = fs.readFileSync(filePath);
  const blob = new Blob([buffer]);
  const form = new FormData();
  form.append("file", blob, fileName);
  const res = await fetch(`${BASE}/knowledge/upload`, { method: "POST", body: form });
  const text = await res.text();
  const lines = text.split("\n").filter(l => l.startsWith("data: "));
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const data = JSON.parse(lines[i].slice(6));
      if (data.step === "done" || data.step === "error") return data;
    } catch { /* skip */ }
  }
  return { ok: false, error: "No done event found" };
}

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
    failed++;
    failures.push({ name, error: err.message });
  }
}

// ── T-RAG-001: 测试数据完整性 ──────────────────────

async function testSampleDataIntegrity() {
  const expected = [
    "专利审查指南.pdf",
    "专利法_2020修正.txt",
    "专利法实施细则_2023.txt",
    "最高法_专利授权确权司法解释一_2020.txt",
    "2024年度专利复审无效典型案例决定要点汇编.pdf",
    "审查标准速查表.xlsx",
    "审查标准速查表.csv",
    "驳回理由对照表.xlsx",
    "三步法流程图.png",
    "专利法条文速查.md",
    "测试案例.json",
    "测试网页内容.txt",
  ];
  for (const file of expected) {
    const filePath = path.join(SAMPLES_DIR, file);
    assert(fileExists(filePath), `Missing: ${file}`);
    assert(fs.statSync(filePath).size > 0, `Empty: ${file}`);
  }
}

// ── T-RAG-002~008: 文件格式验证 ─────────────────────

async function testPdfValidity() {
  const buf = fs.readFileSync(path.join(SAMPLES_DIR, "专利审查指南.pdf"));
  assert(buf[0] === 0x25 && buf[1] === 0x50, "Not valid PDF");
  assert(buf.length > 100_000, "PDF too small");
}

async function testTxtContent() {
  const txt = readFile(path.join(SAMPLES_DIR, "专利法_2020修正.txt"));
  assert(txt.includes("第一条"), "Missing '第一条'");
  assert(txt.includes("第二十二条"), "Missing '第二十二条'");
}

async function testMdStructure() {
  const md = readFile(path.join(SAMPLES_DIR, "专利法条文速查.md"));
  assert(md.startsWith("# 专利法条文速查"), "Missing H1");
  assert(md.includes("## 第一章"), "Missing H2");
}

async function testJsonValidity() {
  const data = JSON.parse(readFile(path.join(SAMPLES_DIR, "测试案例.json")));
  assert(Array.isArray(data), "Not array");
  assert(data.length === 3, `Expected 3 items, got ${data.length}`);
}

async function testCsvContent() {
  const lines = readFile(path.join(SAMPLES_DIR, "审查标准速查表.csv"))
    .split("\n")
    .filter((l) => l.trim());
  assert(lines.length >= 7, `Expected >= 7 lines, got ${lines.length}`);
  assert(lines[0].includes("驳回理由类型"), "Missing header");
}

async function testXlsxValidity() {
  const buf = fs.readFileSync(path.join(SAMPLES_DIR, "审查标准速查表.xlsx"));
  assert(buf[0] === 0x50 && buf[1] === 0x4b, "Not valid XLSX (ZIP)");
}

async function testPngValidity() {
  const buf = fs.readFileSync(path.join(SAMPLES_DIR, "三步法流程图.png"));
  assert(buf[0] === 0x89 && buf[1] === 0x50, "Not valid PNG");
}

// ── T-RAG-009: 切片引擎代码验证（已移至服务端）─────────
// chunkers.ts 已删除，切片逻辑已移至 server/src/routes/knowledge.ts

// ── T-RAG-010: 向量化引擎代码验证 ────────────────────

async function testEmbedderCodeExists() {
  const embedderPath = path.join(CLIENT_SRC, "lib", "knowledge", "embedder.ts");
  assert(fileExists(embedderPath), "embedder.ts not found");
  const code = readFile(embedderPath);
  assert(code.includes("embedRemote"), "Missing embedRemote");
  assert(code.includes("embedChunks"), "Missing embedChunks");
  assert(code.includes("cosineSimilarity"), "Missing cosineSimilarity");
  // cr-1: 移除本地 embedding 模型，不再检查 embedLocal 和 bge-large-zh
}

// ── T-RAG-011: 检索引擎代码验证 ─────────────────────

async function testRetrieverCodeExists() {
  const retrieverPath = path.join(CLIENT_SRC, "lib", "knowledge", "retriever.ts");
  assert(fileExists(retrieverPath), "retriever.ts not found");
  const code = readFile(retrieverPath);
  assert(code.includes("retrieve"), "Missing retrieve function");
  assert(code.includes("formatRetrievedChunks"), "Missing formatRetrievedChunks");
  assert(code.includes("参考法规"), "Missing '参考法规' injection header");
}

// ── T-RAG-012: Prompt 注入代码验证 ───────────────────

async function testPromptInjectorCodeExists() {
  const injectorPath = path.join(CLIENT_SRC, "lib", "knowledge", "promptInjector.ts");
  assert(fileExists(injectorPath), "promptInjector.ts not found");
  const code = readFile(injectorPath);
  assert(code.includes("injectKnowledge"), "Missing injectKnowledge");
  assert(code.includes("extractQueryFromRequest"), "Missing extractQueryFromRequest");
}

// ── T-RAG-013: 类型定义验证 ─────────────────────────

async function testTypeDefinitions() {
  const typesPath = path.join(SHARED_SRC, "types", "knowledge.ts");
  assert(fileExists(typesPath), "knowledge.ts not found");
  const code = readFile(typesPath);
  assert(code.includes("KnowledgeSource"), "Missing KnowledgeSource");
  assert(code.includes("KnowledgeChunk"), "Missing KnowledgeChunk");
  assert(code.includes("KnowledgeVector"), "Missing KnowledgeVector");
  assert(code.includes("KnowledgeConfig"), "Missing KnowledgeConfig");
  assert(code.includes("DEFAULT_KNOWLEDGE_CONFIG"), "Missing DEFAULT_KNOWLEDGE_CONFIG");
  // cr-1: 移除 EmbedProviderType，不再检查
}

// ── T-RAG-014: IndexedDB schema 验证 ────────────────

async function testIndexedDbSchema() {
  const dbPath = path.join(CLIENT_SRC, "lib", "indexedDb.ts");
  assert(fileExists(dbPath), "indexedDb.ts not found");
  const code = readFile(dbPath);
  assert(code.includes("knowledgeSources"), "Missing knowledgeSources store");
  assert(code.includes("knowledgeChunks"), "Missing knowledgeChunks store");
  assert(code.includes("knowledgeVectors"), "Missing knowledgeVectors store");
  assert(code.includes("DB_VERSION = 10"), "DB_VERSION should be 10");
}

// ── T-RAG-015: Agent 集成验证 ───────────────────────

async function testAgentIntegration() {
  const agentPath = path.join(CLIENT_SRC, "agent", "AgentClient.ts");
  assert(fileExists(agentPath), "AgentClient.ts not found");
  const code = readFile(agentPath);
  assert(code.includes("enhancePromptWithKnowledge"), "Missing enhancePromptWithKnowledge method");
  assert(code.includes("injectKnowledge"), "Missing injectKnowledge import");
}

// ── T-RAG-016: 设置页面 UI 验证 ─────────────────────

async function testSettingsUI() {
  const settingsPath = path.join(CLIENT_SRC, "features", "settings", "SettingsPage.tsx");
  assert(fileExists(settingsPath), "SettingsPage.tsx not found");
  const code = readFile(settingsPath);
  assert(code.includes("KnowledgeConfigPanel"), "Missing KnowledgeConfigPanel");
  assert(code.includes('tab === "knowledge"'), "Missing knowledge tab");

  const panelPath = path.join(CLIENT_SRC, "features", "settings", "KnowledgeConfigPanel.tsx");
  assert(fileExists(panelPath), "KnowledgeConfigPanel.tsx not found");
}

// ── T-RAG-017: 知识库 Repository 验证 ────────────────

async function testKnowledgeRepo() {
  const repoPath = path.join(CLIENT_SRC, "lib", "knowledge", "knowledgeRepo.ts");
  assert(fileExists(repoPath), "knowledgeRepo.ts not found");
  const code = readFile(repoPath);
  assert(code.includes("addSource"), "Missing addSource");
  assert(code.includes("addChunks"), "Missing addChunks");
  assert(code.includes("addVectors"), "Missing addVectors");
  assert(code.includes("deleteSource"), "Missing deleteSource");
  assert(code.includes("getKnowledgeStats"), "Missing getKnowledgeStats");
  assert(code.includes("clearAllKnowledge"), "Missing clearAllKnowledge");
}

// ── T-RAG-018: normalizers.ts 验证 ────────────────────
// MIGRATE-007: 文本预处理函数已迁移到服务端，客户端仅保留查询扩展

async function testNormalizerCodeExists() {
  const normalizerPath = path.join(CLIENT_SRC, "lib", "knowledge", "normalizers.ts");
  assert(fileExists(normalizerPath), "normalizers.ts not found");
  const code = readFile(normalizerPath);
  assert(code.includes("expandCrossLanguage"), "Missing expandCrossLanguage");
  assert(code.includes("expandQuery"), "Missing expandQuery");
  assert(code.includes("hashChunkText"), "Missing hashChunkText");
}

// ── T-RAG-019: 切片预处理验证（已移至服务端）──────────
// chunkers.ts 已删除，切片逻辑已移至 server/src/routes/knowledge.ts

// ── T-RAG-020: 规范化验证（已移至服务端）────────────────
// extractors.ts 已删除，规范化逻辑已移至 server/src/routes/knowledge.ts

// ── T-RAG-021: KnowledgeSource fileHash 验证 ──────────

async function testFileHashField() {
  const typesPath = path.join(SHARED_SRC, "types", "knowledge.ts");
  const code = readFile(typesPath);
  assert(code.includes("fileHash"), "Missing fileHash in KnowledgeSource");
}

// ── T-RAG-022: ChunkMetadata documentCategory 验证 ────

async function testDocumentCategoryField() {
  const typesPath = path.join(SHARED_SRC, "types", "knowledge.ts");
  const code = readFile(typesPath);
  assert(code.includes("documentCategory"), "Missing documentCategory in ChunkMetadata");
}

// ── 端到端集成测试 ────────────────────────────────────

async function testUploadAndSearchChain() {
  await fetch(`${BASE}/knowledge/clear`, { method: "DELETE" });
  const uploadResult = await uploadKnowledgeFile("专利法条文速查.md");
  assert(uploadResult.ok === true, `Upload failed: ${JSON.stringify(uploadResult)}`);
  assert(uploadResult.chunkCount > 0, `No chunks: ${uploadResult.chunkCount}`);

  // bg-70: 等待 BM25 索引重建
  await new Promise((r) => setTimeout(r, 2000));

  const searchRes = await fetch(`${BASE}/knowledge/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "新颖性", topK: 3 }),
  });
  const searchData = await searchRes.json();
  assert(searchData.ok === true, `Search failed: ${JSON.stringify(searchData)}`);
  assert(searchData.results.length > 0, "Search returned no results");
  assert(searchData.results[0].text.length > 0, "Result text is empty");
}

async function testSearchResultMetadata() {
  const searchRes = await fetch(`${BASE}/knowledge/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "专利法", topK: 1 }),
  });
  const searchData = await searchRes.json();
  assert(searchData.ok === true, "Search failed");
  assert(searchData.results.length > 0, "No results");

  const result = searchData.results[0];
  assert(typeof result.score === "number", "Missing score");
  assert(typeof result.text === "string" && result.text.length > 0, "Missing text");
  assert(typeof result.metadata === "object", "Missing metadata");
  assert(typeof result.chunkId === "string", "Missing chunkId");
}

async function testMultiFileUploadAndSearch() {
  await fetch(`${BASE}/knowledge/clear`, { method: "DELETE" });

  const files = ["专利法条文速查.md", "测试案例.json", "审查标准速查表.csv"];
  for (const f of files) {
    const result = await uploadKnowledgeFile(f);
    assert(result.ok === true, `Upload ${f} failed`);
  }

  const statsRes = await fetch(`${BASE}/knowledge/stats`);
  const stats = await statsRes.json();
  assert(stats.sourceCount >= 3, `Expected >= 3 sources, got ${stats.sourceCount}`);
  assert(stats.chunkCount >= 3, `Expected >= 3 chunks, got ${stats.chunkCount}`);

  // bg-41: 等待 BM25 索引刷新
  await new Promise((r) => setTimeout(r, 1000));

  const searchRes = await fetch(`${BASE}/knowledge/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "创造性", topK: 5 }),
  });
  const searchData = await searchRes.json();
  assert(searchData.ok === true, `Search failed: ${JSON.stringify(searchData)}`);
  assert(searchData.results.length > 0, "No results for multi-file search");
}

// ── T-RAG-026: 知识库 Provider 测试连接 ─────────────────

async function testKnowledgeProviderTestEndpoint() {
  // 测试缺少参数
  const missingParams = await fetch(`${BASE}/knowledge/providers/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const missingData = await missingParams.json();
  assert(missingData.ok === false, "Should fail with missing params");

  // 测试无效 API key（应返回连接错误，不是 404）
  const invalidKey = await fetch(`${BASE}/knowledge/providers/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      providerType: "embedding",
      baseUrl: "https://api.siliconflow.cn/v1",
      apiKey: "invalid-key",
      modelId: "BAAI/bge-m3",
    }),
  });
  const invalidKeyData = await invalidKey.json();
  // 应该返回 ok: false（鉴权失败），而不是 404（URL 错误）
  assert(invalidKeyData.ok === false, "Should fail with invalid key");
  assert(!invalidKeyData.error?.includes("404"), `Should not get 404, got: ${invalidKeyData.error}`);
}

// ── T-RAG-027: Re-ranker 集成验证 ───────────────────────

async function testRerankerIntegration() {
  // 先上传一个文件
  await fetch(`${BASE}/knowledge/clear`, { method: "DELETE" });
  await uploadKnowledgeFile("专利法条文速查.md");

  // 测试无 reranker 的检索（应回退到向量搜索）
  const searchWithoutReranker = await fetch(`${BASE}/knowledge/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "新颖性", topK: 3 }),
  });
  const dataWithout = await searchWithoutReranker.json();
  assert(dataWithout.ok === true, "Search without reranker should succeed");
  assert(dataWithout.results.length > 0, "Should have results without reranker");

  // 测试无效 reranker 的检索（应 fallback 到向量搜索）
  const searchWithBadReranker = await fetch(`${BASE}/knowledge/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "新颖性",
      topK: 3,
      reranker: {
        baseUrl: "https://invalid-url.example.com/v1",
        apiKey: "invalid",
        modelId: "invalid",
      },
    }),
  });
  const dataWithBad = await searchWithBadReranker.json();
  assert(dataWithBad.ok === true, "Search with bad reranker should fallback gracefully");
  assert(dataWithBad.results.length > 0, "Should have results even with bad reranker");

  // 测试有效 reranker 的检索（使用 SiliconFlow）
  const apiKey = process.env.SILICONFLOW_KEY ?? "";
  if (apiKey) {
    const searchWithReranker = await fetch(`${BASE}/knowledge/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "新颖性判断标准",
        topK: 3,
        reranker: {
          baseUrl: "https://api.siliconflow.cn/v1",
          apiKey,
          modelId: "BAAI/bge-reranker-v2-m3",
        },
      }),
    });
    const dataWith = await searchWithReranker.json();
    assert(dataWith.ok === true, "Search with valid reranker should succeed");
    assert(dataWith.results.length > 0, "Should have results with valid reranker");
  }
}

// ── Server 生命周期管理 ────────────────────────────────

async function startTestServer() {
  // 创建测试数据库目录
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  console.log(`📁 测试数据库目录: ${TEST_DB_DIR}`);

  // 启动 server，使用独立数据库
  serverProcess = spawn("node", ["--import", "tsx", "src/index.ts"], {
    cwd: path.join(ROOT, "server"),
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      KNOWLEDGE_DB_DIR: TEST_DB_DIR,
      KNOWLEDGE_DB_PATH: TEST_DB_PATH,
    },
    stdio: "pipe",
  });

  // 等待 server 就绪
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server startup timeout")), 30000);
    const checkHealth = async () => {
      try {
        const res = await fetch(`${BASE}/health`);
        if (res.ok) {
          clearTimeout(timeout);
          resolve();
        }
      } catch {
        setTimeout(checkHealth, 500);
      }
    };
    serverProcess.stderr.on("data", (data) => {
      const msg = data.toString();
      if (msg.includes("listening")) checkHealth();
    });
    serverProcess.stdout.on("data", (data) => {
      const msg = data.toString();
      if (msg.includes("listening")) checkHealth();
    });
    // 也尝试直接检查
    setTimeout(checkHealth, 2000);
  });

  console.log(`✅ 测试 server 已启动 (port: ${TEST_PORT})`);
}

function stopTestServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

function cleanupTestDb() {
  try {
    if (fs.existsSync(TEST_DB_DIR)) {
      fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
      console.log(`🗑️  测试数据库已清理: ${TEST_DB_DIR}`);
    }
  } catch (err) {
    console.warn(`⚠️  清理测试数据库失败: ${err}`);
  }
}

// ── Main ─────────────────────────────────────────────

async function main() {
  console.log("\n🧪 知识库 RAG 系统 E2E 测试\n");

  // 代码结构验证（不需要 server）
  console.log("── 测试数据验证 ──");
  await runTest("T-RAG-001: 测试数据文件完整性", testSampleDataIntegrity);

  console.log("\n── 文件格式验证 ──");
  await runTest("T-RAG-002: PDF 文件有效性", testPdfValidity);
  await runTest("T-RAG-003: TXT 内容验证", testTxtContent);
  await runTest("T-RAG-004: MD 结构验证", testMdStructure);
  await runTest("T-RAG-005: JSON 有效性", testJsonValidity);
  await runTest("T-RAG-006: CSV 内容验证", testCsvContent);
  await runTest("T-RAG-007: XLSX 有效性", testXlsxValidity);
  await runTest("T-RAG-008: PNG 有效性", testPngValidity);

  console.log("\n── 代码结构验证 ──");
  await runTest("T-RAG-010: 向量化引擎代码", testEmbedderCodeExists);
  await runTest("T-RAG-011: 检索引擎代码", testRetrieverCodeExists);
  await runTest("T-RAG-012: Prompt 注入代码", testPromptInjectorCodeExists);
  await runTest("T-RAG-013: 类型定义完整性", testTypeDefinitions);
  await runTest("T-RAG-014: IndexedDB schema", testIndexedDbSchema);
  await runTest("T-RAG-015: Agent 集成", testAgentIntegration);
  await runTest("T-RAG-016: 设置页面 UI", testSettingsUI);
  await runTest("T-RAG-017: 知识库 Repository", testKnowledgeRepo);

  console.log("\n── 预处理模块验证 ──");
  await runTest("T-RAG-018: normalizers.ts 存在且包含查询扩展函数", testNormalizerCodeExists);
  await runTest("T-RAG-021: KnowledgeSource 包含 fileHash 字段", testFileHashField);
  await runTest("T-RAG-022: ChunkMetadata 包含 documentCategory 字段", testDocumentCategoryField);

  // 端到端集成测试（需要独立 server + 数据库）
  console.log("\n── 端到端集成测试 ──");
  try {
    await startTestServer();
    await runTest("T-RAG-023: 上传→检索完整链路", testUploadAndSearchChain);
    await runTest("T-RAG-024: 检索结果包含元数据", testSearchResultMetadata);
    await runTest("T-RAG-025: 多文件上传后检索", testMultiFileUploadAndSearch);
    await runTest("T-RAG-026: 知识库 Provider 测试连接端点", testKnowledgeProviderTestEndpoint);
    await runTest("T-RAG-027: Re-ranker 集成验证", testRerankerIntegration);
  } finally {
    stopTestServer();
    cleanupTestDb();
  }

  // Summary
  console.log("\n" + "═".repeat(50));
  console.log(`\n📊 测试结果: ${passed} 通过 | ${failed} 失败`);

  if (failures.length > 0) {
    console.log("\n失败用例:");
    for (const f of failures) {
      console.log(`  ❌ ${f.name}: ${f.error}`);
    }
  }

  console.log("");
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test runner error:", err);
  stopTestServer();
  cleanupTestDb();
  process.exit(1);
});
