/**
 * 知识库 RAG 系统 E2E 测试
 * =========================
 *
 * 测试覆盖：
 * - T-RAG-001: 测试数据文件完整性
 * - T-RAG-002~008: 各格式文件有效性验证
 * - T-RAG-009: 切片引擎代码结构验证
 * - T-RAG-010: 向量化引擎代码结构验证
 * - T-RAG-011: 检索引擎代码结构验证
 * - T-RAG-012: Prompt 注入代码结构验证
 * - T-RAG-013: 类型定义完整性验证
 * - T-RAG-014: IndexedDB schema 验证
 *
 * Usage:
 *   node tests/knowledge-base-e2e.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SAMPLES_DIR = path.join(ROOT, "samples", "knowledge-base");
const CLIENT_SRC = path.join(ROOT, "client", "src");
const SHARED_SRC = path.join(ROOT, "shared", "src");

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

// ── T-RAG-009: 切片引擎代码验证 ─────────────────────

async function testChunkerCodeExists() {
  const chunkerPath = path.join(CLIENT_SRC, "lib", "knowledge", "chunkers.ts");
  assert(fileExists(chunkerPath), "chunkers.ts not found");
  const code = readFile(chunkerPath);
  assert(code.includes("chunkBySection"), "Missing chunkBySection");
  assert(code.includes("chunkByArticle"), "Missing chunkByArticle");
  assert(code.includes("chunkByHeading"), "Missing chunkByHeading");
  assert(code.includes("chunkByJsonKey"), "Missing chunkByJsonKey");
  assert(code.includes("chunkByTableRow"), "Missing chunkByTableRow");
  assert(code.includes("chunkImageOcr"), "Missing chunkImageOcr");
  assert(code.includes("selectChunkStrategy"), "Missing selectChunkStrategy");
}

// ── T-RAG-010: 向量化引擎代码验证 ────────────────────

async function testEmbedderCodeExists() {
  const embedderPath = path.join(CLIENT_SRC, "lib", "knowledge", "embedder.ts");
  assert(fileExists(embedderPath), "embedder.ts not found");
  const code = readFile(embedderPath);
  assert(code.includes("embedLocal"), "Missing embedLocal");
  assert(code.includes("embedRemote"), "Missing embedRemote");
  assert(code.includes("embedChunks"), "Missing embedChunks");
  assert(code.includes("cosineSimilarity"), "Missing cosineSimilarity");
  assert(code.includes("bge-large-zh"), "Missing BGE model reference");
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
  assert(code.includes("EmbedProviderType"), "Missing EmbedProviderType");
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

// ── Main ─────────────────────────────────────────────

async function main() {
  console.log("\n🧪 知识库 RAG 系统 E2E 测试\n");

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
  await runTest("T-RAG-009: 切片引擎代码", testChunkerCodeExists);
  await runTest("T-RAG-010: 向量化引擎代码", testEmbedderCodeExists);
  await runTest("T-RAG-011: 检索引擎代码", testRetrieverCodeExists);
  await runTest("T-RAG-012: Prompt 注入代码", testPromptInjectorCodeExists);
  await runTest("T-RAG-013: 类型定义完整性", testTypeDefinitions);
  await runTest("T-RAG-014: IndexedDB schema", testIndexedDbSchema);
  await runTest("T-RAG-015: Agent 集成", testAgentIntegration);
  await runTest("T-RAG-016: 设置页面 UI", testSettingsUI);
  await runTest("T-RAG-017: 知识库 Repository", testKnowledgeRepo);

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
  process.exit(1);
});
