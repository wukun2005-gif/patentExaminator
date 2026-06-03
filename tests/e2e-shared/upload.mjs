/**
 * E2E 测试文件上传工具
 * ====================
 *
 * 统一的知识库文件上传逻辑，用于 knowledge-base-e2e.mjs 和 e2e-real.mjs。
 */

import fs from "fs";
import path from "path";
import { getTestBase } from "./env.mjs";

// ── 文件上传工具 ────────────────────────────────────────────────────

/**
 * 上传文件到知识库
 *
 * @param {string} filePath - 文件路径
 * @param {object} [options] - 可选配置
 * @param {string} [options.baseUrl] - 服务器地址
 * @param {object} [options.embedding] - Embedding 配置 { baseUrl, apiKey, modelId }
 * @param {object} [options.reranker] - Reranker 配置 { baseUrl, apiKey, modelId }
 * @returns {Promise<{ok: boolean, data: object|null, error: string|null}>}
 */
export async function uploadKnowledgeFile(filePath, options = {}) {
  const base = options.baseUrl || getTestBase();
  const fileName = path.basename(filePath);

  // 读取文件
  const buffer = fs.readFileSync(filePath);
  const blob = new Blob([buffer]);
  const formData = new FormData();
  formData.append("file", blob, fileName);

  // 传递 embedding/reranker 配置（与服务端 knowledge.ts 接口一致）
  if (options.embedding) {
    formData.append("embeddingConfig", JSON.stringify(options.embedding));
  }
  if (options.reranker) {
    formData.append("rerankerConfig", JSON.stringify(options.reranker));
  }

  // 发送请求
  const res = await fetch(`${base}/knowledge/upload`, {
    method: "POST",
    body: formData,
  });

  // 解析 SSE 响应
  const text = await res.text();
  const lines = text.split("\n").filter((l) => l.startsWith("data: "));

  // 从后向前查找 done 或 error 事件
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const data = JSON.parse(lines[i].slice(6));
      if (data.step === "done" || data.step === "error") {
        return {
          ok: data.step === "done",
          data,
          error: data.step === "error" ? data.error : null,
        };
      }
    } catch {
      // 跳过解析失败的行
    }
  }

  return { ok: false, data: null, error: "No done event found" };
}

/**
 * 批量上传文件到知识库
 *
 * @param {string[]} filePaths - 文件路径数组
 * @param {string} [baseUrl] - 可选的服务器地址
 * @returns {Promise<Array<{ok: boolean, data: object|null, error: string|null}>>}
 */
export async function uploadMultipleFiles(filePaths, baseUrl) {
  const results = [];

  for (const filePath of filePaths) {
    const result = await uploadKnowledgeFile(filePath, baseUrl);
    results.push(result);
  }

  return results;
}

/**
 * 上传目录中的所有文件
 *
 * @param {string} dirPath - 目录路径
 * @param {string[]} [extensions] - 可选的文件扩展名过滤
 * @param {string} [baseUrl] - 可选的服务器地址
 * @returns {Promise<Array<{ok: boolean, data: object|null, error: string|null}>>}
 */
export async function uploadDirectory(dirPath, extensions, baseUrl) {
  const files = fs.readdirSync(dirPath);
  const filteredFiles = extensions
    ? files.filter((f) => extensions.some((ext) => f.endsWith(ext)))
    : files;

  const filePaths = filteredFiles.map((f) => path.join(dirPath, f));
  return uploadMultipleFiles(filePaths, baseUrl);
}
