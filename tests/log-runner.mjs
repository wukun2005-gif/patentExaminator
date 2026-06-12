#!/usr/bin/env node
/**
 * 测试日志包装器
 * 运行命令，同时将 stdout/stderr 写入 tests/logs/ 下的时间戳日志文件。
 * 非当天的旧日志自动清理。
 *
 * 用法: node tests/log-runner.mjs <command> [args...]
 * 示例: node tests/log-runner.mjs vitest run
 */
import { spawn } from "child_process";
import { mkdirSync, rmSync, readdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { backupDatabases } from "./backup-db.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 每天首次跑测试时自动备份用户数据库（保留最近 7 天）
try { backupDatabases(); } catch { /* backup failure should not block tests */ }
const LOG_DIR = join(__dirname, "logs");
mkdirSync(LOG_DIR, { recursive: true });

// 清理非当天的旧日志
const todayPrefix = new Date().toISOString().slice(0, 10);
try {
  for (const file of readdirSync(LOG_DIR)) {
    if (file.endsWith(".log") && !file.includes(todayPrefix)) {
      rmSync(join(LOG_DIR, file));
    }
  }
} catch {}

// 生成日志文件名
const now = new Date();
const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
const testName = process.argv[2]?.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30) || "test";
const logFile = join(LOG_DIR, `${testName}-${ts}.log`);

// 获取要运行的命令
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node tests/log-runner.mjs <command> [args...]");
  process.exit(1);
}

const header = [
  `# Test Run: ${args.join(" ")}`,
  `# Date: ${now.toISOString()}`,
  `# Log: ${logFile}`,
  "",
].join("\n");

writeFileSync(logFile, header);

const child = spawn(args[0], args.slice(1), {
  stdio: ["ignore", "pipe", "pipe"],
  shell: process.platform === "win32",
});

const { openSync, appendFileSync, closeSync } = await import("fs");
const fd = openSync(logFile, "a");

function onData(chunk) {
  process.stdout.write(chunk);
  appendFileSync(fd, chunk);
}

child.stdout.on("data", onData);
child.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
  appendFileSync(fd, chunk);
});

child.on("close", (code) => {
  const footer = `\n# Exit code: ${code}\n# Duration: ${Date.now() - now.getTime()}ms\n`;
  appendFileSync(fd, footer);
  closeSync(fd);
  console.log(`\n[log-runner] Log saved: ${logFile}`);
  process.exit(code ?? 1);
});
