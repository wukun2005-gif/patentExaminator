/**
 * 知识库测试
 * =========
 *
 * 测试知识库的上传、搜索、删除等功能。
 */

import fs from "fs";
import path from "path";
import {
  postJSON,
  getJSON,
  log,
  uploadKnowledgeFile,
  assert,
  getTestBase,
  getApiKey,
  SAMPLES_KNOWLEDGE_DIR,
  SILICONFLOW_BASE_URL,
} from "../e2e-shared/index.mjs";

const TIMEOUT_MS = 30_000;

// 带超时的 fetch
function fetchWithTimeout(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

// 安全解析 JSON（先检查 res.ok，非 2xx 抛异常）
async function safeJson(res, label) {
  if (!res.ok && res.status >= 500) {
    const text = await res.text().catch(() => "");
    throw new Error(`${label}: HTTP ${res.status} ${text.slice(0, 100)}`);
  }
  return res.json();
}

// 构建 embedding/reranker 配置（当前用同一个 key，但结构独立以便将来扩展）
function getKnowledgeUploadOptions() {
  const embeddingKey = getApiKey("embedding");
  const rerankerKey = getApiKey("reranker");
  const options = {};
  if (embeddingKey) {
    options.embedding = {
      baseUrl: SILICONFLOW_BASE_URL,
      apiKey: embeddingKey,
      modelId: "BAAI/bge-m3",
    };
  }
  if (rerankerKey) {
    options.reranker = {
      baseUrl: SILICONFLOW_BASE_URL,
      apiKey: rerankerKey,
      modelId: "BAAI/bge-reranker-v2-m3",
    };
  }
  return options;
}

// ── 知识库测试 ──────────────────────────────────────────────────────

async function runUploadTest(label, fileName, optional = false) {
  const filePath = path.join(SAMPLES_KNOWLEDGE_DIR, fileName);
  if (optional && !fs.existsSync(filePath)) {
    log(`Knowledge Upload ${label}`, true, "skipped (file not found)");
    return;
  }
  const result = await uploadKnowledgeFile(filePath, getKnowledgeUploadOptions());
  log(`Knowledge Upload ${label}`, result.ok, result.ok ? `file=${fileName}` : result.error);
}

export async function testKnowledgeUploadTxt() { await runUploadTest("TXT", "专利法_2020修正.txt"); }
export async function testKnowledgeUploadLargeFile() { await runUploadTest("Large File", "专利审查指南.pdf", true); }
export async function testKnowledgeUploadMd() { await runUploadTest("MD", "专利法条文速查.md"); }
export async function testKnowledgeUploadJson() { await runUploadTest("JSON", "测试案例.json"); }
export async function testKnowledgeUploadCsv() { await runUploadTest("CSV", "审查标准速查表.csv"); }

export async function testKnowledgeDuplicateDetection() {
  const filePath = path.join(SAMPLES_KNOWLEDGE_DIR, "专利法_2020修正.txt");
  const opts = getKnowledgeUploadOptions();
  // 上传两次，第二次应该检测到重复
  await uploadKnowledgeFile(filePath, opts);
  const result = await uploadKnowledgeFile(filePath, opts);
  log("Knowledge Duplicate Detection", result.ok, "second upload should handle duplicate");
}

export async function testKnowledgeStats() {
  const res = await getJSON("/knowledge/stats");
  const data = await safeJson(res, "Knowledge Stats");
  const hasStats = data.chunkCount > 0 && data.sourceCount > 0;
  log("Knowledge Stats", hasStats,
    hasStats ? `chunks=${data.chunkCount}, sources=${data.sourceCount}` : JSON.stringify(data));
}

export async function testKnowledgeSearch() {
  const res = await postJSON("/knowledge/search", {
    query: "专利法 新颖性",
    topK: 5,
  });
  const data = await safeJson(res, "Knowledge Search");
  const hasResults = Array.isArray(data.results) && data.results.length > 0;
  log("Knowledge Search", hasResults,
    hasResults ? `results=${data.results.length}` : JSON.stringify(data));
}

export async function testKnowledgeSourcesList() {
  const res = await getJSON("/knowledge/sources");
  const data = await safeJson(res, "Knowledge Sources List");
  const hasSources = Array.isArray(data.sources) && data.sources.length > 0;
  log("Knowledge Sources List", hasSources,
    hasSources ? `sources=${data.sources.length}` : JSON.stringify(data));
}

export async function testKnowledgeDelete() {
  // 先获取来源列表
  const sourcesRes = await getJSON("/knowledge/sources");
  const sourcesData = await safeJson(sourcesRes, "Knowledge Delete: list sources");

  if (!Array.isArray(sourcesData.sources) || sourcesData.sources.length === 0) {
    log("Knowledge Delete", false, "no sources to delete");
    return;
  }

  const sourceToDelete = sourcesData.sources[0];
  const res = await fetchWithTimeout(`${getTestBase()}/knowledge/sources/${encodeURIComponent(sourceToDelete.name)}`, {
    method: "DELETE",
  });
  const data = await safeJson(res, "Knowledge Delete");
  log("Knowledge Delete", data.ok === true,
    data.ok ? `deleted=${sourceToDelete.name}` : JSON.stringify(data));
}

export async function testKnowledgeClearAll() {
  const res = await fetchWithTimeout(`${getTestBase()}/knowledge/clear`, {
    method: "DELETE",
  });
  const data = await safeJson(res, "Knowledge Clear All");
  log("Knowledge Clear All", data.ok === true,
    data.ok ? "cleared" : JSON.stringify(data));
}

// ── 集成测试（从 knowledge-base-e2e.mjs 迁移）──────────────────────

export async function testKnowledgeUploadAndSearchChain() {
  const BASE = getTestBase();
  await fetchWithTimeout(`${BASE}/knowledge/clear`, { method: "DELETE" }).catch(() => {});

  const filePath = path.join(SAMPLES_KNOWLEDGE_DIR, "专利法条文速查.md");
  const uploadResult = await uploadKnowledgeFile(filePath, getKnowledgeUploadOptions());
  log("Knowledge Upload→Search: upload", uploadResult.ok,
    uploadResult.ok ? `chunks=${uploadResult.data?.chunkCount}` : uploadResult.error);

  if (!uploadResult.ok) return;

  await new Promise((r) => setTimeout(r, 2000));

  const searchRes = await postJSON("/knowledge/search", { query: "新颖性", topK: 3 });
  const searchData = await safeJson(searchRes, "Upload→Search: search");
  const hasResults = searchData.ok && Array.isArray(searchData.results) && searchData.results.length > 0;
  log("Knowledge Upload→Search: search", hasResults,
    hasResults ? `results=${searchData.results.length}` : JSON.stringify(searchData));
}

export async function testKnowledgeSearchResultMetadata() {
  const searchRes = await postJSON("/knowledge/search", { query: "专利法", topK: 1 });
  const searchData = await safeJson(searchRes, "Search Metadata");

  if (!searchData.results || searchData.results.length === 0) {
    log("Knowledge Search Metadata", false, "no results");
    return;
  }

  const result = searchData.results[0];
  const hasScore = typeof result.score === "number";
  const hasText = typeof result.text === "string" && result.text.length > 0;
  const hasMetadata = typeof result.metadata === "object";
  const hasChunkId = typeof result.chunkId === "string";
  const valid = hasScore && hasText && hasMetadata && hasChunkId;
  log("Knowledge Search Metadata", valid,
    valid ? `score=${result.score?.toFixed(2)}` : `score=${hasScore}, text=${hasText}, meta=${hasMetadata}, chunkId=${hasChunkId}`);
}

export async function testKnowledgeMultiFileUploadAndSearch() {
  const BASE = getTestBase();
  await fetchWithTimeout(`${BASE}/knowledge/clear`, { method: "DELETE" }).catch(() => {});

  const files = ["专利法条文速查.md", "测试案例.json", "审查标准速查表.csv"];
  const opts = getKnowledgeUploadOptions();
  for (const f of files) {
    const filePath = path.join(SAMPLES_KNOWLEDGE_DIR, f);
    const result = await uploadKnowledgeFile(filePath, opts);
    log(`Knowledge MultiFile: upload ${f}`, result.ok);
    if (!result.ok) return;
  }

  const statsRes = await getJSON("/knowledge/stats");
  const stats = await safeJson(statsRes, "MultiFile: stats");
  const hasEnough = stats.sourceCount >= 3 && stats.chunkCount >= 3;
  log("Knowledge MultiFile: stats", hasEnough,
    `sources=${stats.sourceCount}, chunks=${stats.chunkCount}`);

  await new Promise((r) => setTimeout(r, 1000));

  const searchRes = await postJSON("/knowledge/search", { query: "创造性", topK: 5 });
  const searchData = await safeJson(searchRes, "MultiFile: search");
  const hasResults = searchData.ok && searchData.results?.length > 0;
  log("Knowledge MultiFile: search", hasResults,
    hasResults ? `results=${searchData.results.length}` : "no results");
}

export async function testKnowledgeProviderTestEndpoint() {
  const BASE = getTestBase();

  // 测试缺少参数
  const missingRes = await fetchWithTimeout(`${BASE}/knowledge/providers/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const missingData = await safeJson(missingRes, "Provider Test: missing params");
  log("Knowledge Provider Test: missing params", missingData.ok === false);

  // 测试无效 API key（应返回连接错误，不是 404）
  const invalidRes = await fetchWithTimeout(`${BASE}/knowledge/providers/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      providerType: "embedding",
      baseUrl: SILICONFLOW_BASE_URL,
      apiKey: "invalid-key",
      modelId: "BAAI/bge-m3",
    }),
  });
  const invalidData = await safeJson(invalidRes, "Provider Test: invalid key");
  const isAuthError = invalidData.ok === false && !invalidData.error?.includes("404");
  log("Knowledge Provider Test: invalid key", isAuthError,
    isAuthError ? "auth error as expected" : `error=${invalidData.error}`);
}

export async function testKnowledgeRerankerIntegration() {
  const BASE = getTestBase();

  await fetchWithTimeout(`${BASE}/knowledge/clear`, { method: "DELETE" }).catch(() => {});
  const filePath = path.join(SAMPLES_KNOWLEDGE_DIR, "专利法条文速查.md");
  await uploadKnowledgeFile(filePath, getKnowledgeUploadOptions());

  // 测试无 reranker 的检索
  const searchWithout = await postJSON("/knowledge/search", { query: "新颖性", topK: 3 });
  const dataWithout = await safeJson(searchWithout, "Reranker: without");
  log("Knowledge Reranker: without reranker", dataWithout.ok && dataWithout.results?.length > 0);

  // 测试无效 reranker 的检索
  const searchWithBad = await postJSON("/knowledge/search", {
    query: "新颖性",
    topK: 3,
    reranker: { baseUrl: "https://invalid-url.example.com/v1", apiKey: "invalid", modelId: "invalid" },
  });
  const dataWithBad = await safeJson(searchWithBad, "Reranker: bad");
  log("Knowledge Reranker: bad reranker fallback", dataWithBad.ok && dataWithBad.results?.length > 0);

  // 测试有效 reranker
  const rerankerKey = getApiKey("reranker");
  if (rerankerKey) {
    const searchWithGood = await postJSON("/knowledge/search", {
      query: "新颖性判断标准",
      topK: 3,
      reranker: { baseUrl: SILICONFLOW_BASE_URL, apiKey: rerankerKey, modelId: "BAAI/bge-reranker-v2-m3" },
    });
    const dataWithGood = await safeJson(searchWithGood, "Reranker: valid");
    log("Knowledge Reranker: valid reranker", dataWithGood.ok && dataWithGood.results?.length > 0);
  } else {
    log("Knowledge Reranker: valid reranker", true, "skipped (no reranker key)");
  }
}
