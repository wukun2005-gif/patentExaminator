/**
 * 知识库代码结构验证测试
 * =====================
 *
 * 验证知识库相关的代码结构、类型定义、配置完整性。
 * 这些测试不需要运行服务器，只检查源码文件。
 *
 * 从 tests/knowledge-base-e2e.mjs 迁移（T-RAG-001~022）。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { log, assert, SAMPLES_KNOWLEDGE_DIR } from "../e2e-shared/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const CLIENT_SRC = path.join(ROOT, "client", "src");
const SERVER_SRC = path.join(ROOT, "server", "src");
const SHARED_SRC = path.join(ROOT, "shared", "src");

function fileExists(p) {
  return fs.existsSync(p);
}

function readFile(p) {
  return fs.readFileSync(p, "utf-8");
}

// ── T-RAG-001: 测试数据完整性 ──────────────────────────────────────

export async function testSampleDataIntegrity() {
  const files = fs.readdirSync(SAMPLES_KNOWLEDGE_DIR);
  assert(files.length > 0, "No files in samples/knowledge-base/");
  for (const file of files) {
    const filePath = path.join(SAMPLES_KNOWLEDGE_DIR, file);
    const stat = fs.statSync(filePath);
    assert(stat.isFile(), `Not a file: ${file}`);
    assert(stat.size > 0, `Empty: ${file}`);
  }
  log("T-RAG-001: 测试数据文件完整性", true, `${files.length} files`);
}

// ── T-RAG-002~008: 文件格式验证 ─────────────────────────────────────

export async function testPdfValidity() {
  const buf = fs.readFileSync(path.join(SAMPLES_KNOWLEDGE_DIR, "专利审查指南.pdf"));
  assert(buf[0] === 0x25 && buf[1] === 0x50, "Not valid PDF");
  assert(buf.length > 100_000, "PDF too small");
  log("T-RAG-002: PDF 文件有效性", true, `${(buf.length / 1024).toFixed(0)}KB`);
}

export async function testTxtContent() {
  const txt = readFile(path.join(SAMPLES_KNOWLEDGE_DIR, "专利法_2020修正.txt"));
  assert(txt.includes("第一条"), "Missing '第一条'");
  assert(txt.includes("第二十二条"), "Missing '第二十二条'");
  log("T-RAG-003: TXT 内容验证", true);
}

export async function testMdStructure() {
  const md = readFile(path.join(SAMPLES_KNOWLEDGE_DIR, "专利法条文速查.md"));
  assert(md.startsWith("# 专利法条文速查"), "Missing H1");
  assert(md.includes("## 第一章"), "Missing H2");
  log("T-RAG-004: MD 结构验证", true);
}

export async function testJsonValidity() {
  const data = JSON.parse(readFile(path.join(SAMPLES_KNOWLEDGE_DIR, "测试案例.json")));
  assert(Array.isArray(data), "Not array");
  assert(data.length === 3, `Expected 3 items, got ${data.length}`);
  log("T-RAG-005: JSON 有效性", true, `${data.length} items`);
}

export async function testCsvContent() {
  const lines = readFile(path.join(SAMPLES_KNOWLEDGE_DIR, "审查标准速查表.csv"))
    .split("\n")
    .filter((l) => l.trim());
  assert(lines.length >= 7, `Expected >= 7 lines, got ${lines.length}`);
  assert(lines[0].includes("驳回理由类型"), "Missing header");
  log("T-RAG-006: CSV 内容验证", true, `${lines.length} lines`);
}

export async function testXlsxValidity() {
  const buf = fs.readFileSync(path.join(SAMPLES_KNOWLEDGE_DIR, "审查标准速查表.xlsx"));
  assert(buf[0] === 0x50 && buf[1] === 0x4b, "Not valid XLSX (ZIP)");
  log("T-RAG-007: XLSX 有效性", true);
}

export async function testPngValidity() {
  const buf = fs.readFileSync(path.join(SAMPLES_KNOWLEDGE_DIR, "三步法流程图.png"));
  assert(buf[0] === 0x89 && buf[1] === 0x50, "Not valid PNG");
  log("T-RAG-008: PNG 有效性", true);
}

// ── T-RAG-010: 向量化引擎代码验证 ──────────────────────────────────

export async function testEmbedderCodeExists() {
  const knowledgeRoutePath = path.join(SERVER_SRC, "routes", "knowledge.ts");
  assert(fileExists(knowledgeRoutePath), "server knowledge.ts not found");
  const code = readFile(knowledgeRoutePath);
  assert(code.includes("embed") || code.includes("vector"), "Server knowledge route should handle embedding/vector operations");
  log("T-RAG-010: 向量化引擎代码", true);
}

// ── T-RAG-011: 检索引擎代码验证 ────────────────────────────────────

export async function testRetrieverCodeExists() {
  const retrieverPath = path.join(CLIENT_SRC, "lib", "knowledge", "retriever.ts");
  assert(fileExists(retrieverPath), "retriever.ts not found");
  const code = readFile(retrieverPath);
  assert(code.includes("retrieve"), "Missing retrieve function");
  assert(code.includes("formatRetrievedChunks"), "Missing formatRetrievedChunks");
  assert(code.includes("参考法规"), "Missing '参考法规' injection header");
  log("T-RAG-011: 检索引擎代码", true);
}

// ── T-RAG-012: Prompt 注入代码验证 ─────────────────────────────────

export async function testPromptInjectorCodeExists() {
  const injectorPath = path.join(CLIENT_SRC, "lib", "knowledge", "promptInjector.ts");
  assert(fileExists(injectorPath), "promptInjector.ts not found");
  const code = readFile(injectorPath);
  assert(code.includes("injectKnowledge"), "Missing injectKnowledge");
  assert(code.includes("extractQueryFromRequest"), "Missing extractQueryFromRequest");
  log("T-RAG-012: Prompt 注入代码", true);
}

// ── T-RAG-013: 类型定义验证 ────────────────────────────────────────

export async function testTypeDefinitions() {
  const typesPath = path.join(SHARED_SRC, "types", "knowledge.ts");
  assert(fileExists(typesPath), "knowledge.ts not found");
  const code = readFile(typesPath);
  assert(code.includes("KnowledgeSource"), "Missing KnowledgeSource");
  assert(code.includes("KnowledgeChunk"), "Missing KnowledgeChunk");
  assert(code.includes("KnowledgeVector"), "Missing KnowledgeVector");
  assert(code.includes("KnowledgeConfig"), "Missing KnowledgeConfig");
  assert(code.includes("DEFAULT_KNOWLEDGE_CONFIG"), "Missing DEFAULT_KNOWLEDGE_CONFIG");
  log("T-RAG-013: 类型定义完整性", true);
}

// ── T-RAG-014: 数据持久化验证 ──────────────────────────────────────

export async function testIndexedDbSchema() {
  // B-038 迁移后，IndexedDB 已移至服务端 SQLite
  // 验证 repos.ts 包含 knowledge 相关的 CRUD 操作
  const reposPath = path.join(CLIENT_SRC, "lib", "repos.ts");
  assert(fileExists(reposPath), "repos.ts not found");
  const reposCode = readFile(reposPath);
  assert(reposCode.includes("knowledge") || reposCode.includes("Knowledge"), "repos.ts should handle knowledge data");

  // 验证 knowledgeRepo.ts 存在
  const knowledgeRepoPath = path.join(CLIENT_SRC, "lib", "knowledge", "knowledgeRepo.ts");
  assert(fileExists(knowledgeRepoPath), "knowledgeRepo.ts not found");

  log("T-RAG-014: 数据持久化验证", true);
}

// ── T-RAG-015: Agent 集成验证 ──────────────────────────────────────

export async function testAgentIntegration() {
  // B-038 迁移后，AgentClient.ts 已删除，AI 调用通过服务端 orchestrator
  // 验证 promptInjector.ts 包含 injectKnowledge 函数
  const injectorPath = path.join(CLIENT_SRC, "lib", "knowledge", "promptInjector.ts");
  assert(fileExists(injectorPath), "promptInjector.ts not found");
  const code = readFile(injectorPath);
  assert(code.includes("injectKnowledge"), "Missing injectKnowledge function");
  log("T-RAG-015: Agent 集成", true);
}

// ── T-RAG-016: 设置页面 UI 验证 ────────────────────────────────────

export async function testSettingsUI() {
  const settingsPath = path.join(CLIENT_SRC, "features", "settings", "SettingsPage.tsx");
  assert(fileExists(settingsPath), "SettingsPage.tsx not found");
  const code = readFile(settingsPath);
  assert(code.includes("KnowledgeConfigPanel"), "Missing KnowledgeConfigPanel");
  assert(code.includes('tab === "knowledge"'), "Missing knowledge tab");

  const panelPath = path.join(CLIENT_SRC, "features", "settings", "KnowledgeConfigPanel.tsx");
  assert(fileExists(panelPath), "KnowledgeConfigPanel.tsx not found");
  log("T-RAG-016: 设置页面 UI", true);
}

// ── T-RAG-017: 知识库 Repository 验证 ──────────────────────────────

export async function testKnowledgeRepo() {
  const repoPath = path.join(CLIENT_SRC, "lib", "knowledge", "knowledgeRepo.ts");
  assert(fileExists(repoPath), "knowledgeRepo.ts not found");
  const code = readFile(repoPath);
  assert(code.includes("addSource"), "Missing addSource");
  assert(code.includes("addChunks"), "Missing addChunks");
  assert(code.includes("addVectors"), "Missing addVectors");
  assert(code.includes("deleteSource"), "Missing deleteSource");
  assert(code.includes("getKnowledgeStats"), "Missing getKnowledgeStats");
  assert(code.includes("clearAllKnowledge"), "Missing clearAllKnowledge");
  log("T-RAG-017: 知识库 Repository", true);
}

// ── T-RAG-018: 查询扩展验证 ────────────────────────────────────────

export async function testNormalizerCodeExists() {
  const queryExpandPath = path.join(SERVER_SRC, "lib", "queryExpand.ts");
  assert(fileExists(queryExpandPath), "server queryExpand.ts not found");
  const code = readFile(queryExpandPath);
  assert(code.includes("expandCrossLanguage"), "Missing expandCrossLanguage");
  assert(code.includes("expandQuery"), "Missing expandQuery");
  assert(code.includes("expandQueryWithGraph"), "Missing expandQueryWithGraph");
  assert(code.includes("expandQueryFull"), "Missing expandQueryFull");
  log("T-RAG-018: 查询扩展验证", true);
}

// ── T-RAG-021: fileHash 字段验证 ───────────────────────────────────

export async function testFileHashField() {
  const typesPath = path.join(SHARED_SRC, "types", "knowledge.ts");
  const code = readFile(typesPath);
  assert(code.includes("fileHash"), "Missing fileHash in KnowledgeSource");
  log("T-RAG-021: fileHash 字段", true);
}

// ── T-RAG-022: documentCategory 字段验证 ───────────────────────────

export async function testDocumentCategoryField() {
  const typesPath = path.join(SHARED_SRC, "types", "knowledge.ts");
  const code = readFile(typesPath);
  assert(code.includes("documentCategory"), "Missing documentCategory in ChunkMetadata");
  log("T-RAG-022: documentCategory 字段", true);
}
