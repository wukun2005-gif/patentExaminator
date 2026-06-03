/**
 * 知识库测试
 * =========
 *
 * 测试知识库的上传、搜索、删除等功能。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  postJSON,
  getJSON,
  log,
  uploadKnowledgeFile,
  assert,
  getTestBase,
} from "../e2e-shared/index.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SAMPLES_DIR = path.resolve(__dirname, "../../samples/knowledge-base");

// ── 知识库测试 ──────────────────────────────────────────────────────

export async function testKnowledgeUploadTxt() {
  const filePath = path.join(SAMPLES_DIR, "专利法_2020修正.txt");
  const result = await uploadKnowledgeFile(filePath);
  log("Knowledge Upload TXT", result.ok, result.ok ? `file=${path.basename(filePath)}` : result.error);
}

export async function testKnowledgeUploadLargeFile() {
  const filePath = path.join(SAMPLES_DIR, "专利审查指南.pdf");
  if (!fs.existsSync(filePath)) {
    log("Knowledge Upload Large File", true, "skipped (file not found)");
    return;
  }
  const result = await uploadKnowledgeFile(filePath);
  log("Knowledge Upload Large File", result.ok, result.ok ? `file=${path.basename(filePath)}` : result.error);
}

export async function testKnowledgeUploadMd() {
  const filePath = path.join(SAMPLES_DIR, "专利法条文速查.md");
  const result = await uploadKnowledgeFile(filePath);
  log("Knowledge Upload MD", result.ok, result.ok ? `file=${path.basename(filePath)}` : result.error);
}

export async function testKnowledgeUploadJson() {
  const filePath = path.join(SAMPLES_DIR, "测试案例.json");
  const result = await uploadKnowledgeFile(filePath);
  log("Knowledge Upload JSON", result.ok, result.ok ? `file=${path.basename(filePath)}` : result.error);
}

export async function testKnowledgeUploadCsv() {
  const filePath = path.join(SAMPLES_DIR, "审查标准速查表.csv");
  const result = await uploadKnowledgeFile(filePath);
  log("Knowledge Upload CSV", result.ok, result.ok ? `file=${path.basename(filePath)}` : result.error);
}

export async function testKnowledgeDuplicateDetection() {
  const filePath = path.join(SAMPLES_DIR, "专利法_2020修正.txt");
  // 上传两次，第二次应该检测到重复
  await uploadKnowledgeFile(filePath);
  const result = await uploadKnowledgeFile(filePath);
  log("Knowledge Duplicate Detection", result.ok, "second upload should handle duplicate");
}

export async function testKnowledgeStats() {
  const res = await getJSON("/knowledge/stats");
  const data = await res.json();
  const hasStats = data.chunkCount > 0 && data.sourceCount > 0;
  log("Knowledge Stats", hasStats,
    hasStats ? `chunks=${data.chunkCount}, sources=${data.sourceCount}` : JSON.stringify(data));
}

export async function testKnowledgeSearch() {
  const res = await postJSON("/knowledge/search", {
    query: "专利法 新颖性",
    topK: 5,
  });
  const data = await res.json();
  const hasResults = Array.isArray(data.results) && data.results.length > 0;
  log("Knowledge Search", hasResults,
    hasResults ? `results=${data.results.length}` : JSON.stringify(data));
}

export async function testKnowledgeSourcesList() {
  const res = await getJSON("/knowledge/sources");
  const data = await res.json();
  const hasSources = Array.isArray(data.sources) && data.sources.length > 0;
  log("Knowledge Sources List", hasSources,
    hasSources ? `sources=${data.sources.length}` : JSON.stringify(data));
}

export async function testKnowledgeDelete() {
  // 先获取来源列表
  const sourcesRes = await getJSON("/knowledge/sources");
  const sourcesData = await sourcesRes.json();

  if (!Array.isArray(sourcesData.sources) || sourcesData.sources.length === 0) {
    log("Knowledge Delete", false, "no sources to delete");
    return;
  }

  const sourceToDelete = sourcesData.sources[0];
  const res = await fetch(`${getTestBase()}/knowledge/sources/${encodeURIComponent(sourceToDelete.name)}`, {
    method: "DELETE",
  });
  const data = await res.json();
  log("Knowledge Delete", data.ok === true,
    data.ok ? `deleted=${sourceToDelete.name}` : JSON.stringify(data));
}

export async function testKnowledgeClearAll() {
  const res = await fetch(`${getTestBase()}/knowledge/clear`, {
    method: "DELETE",
  });
  const data = await res.json();
  log("Knowledge Clear All", data.ok === true,
    data.ok ? "cleared" : JSON.stringify(data));
}
