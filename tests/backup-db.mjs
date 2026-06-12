/**
 * 测试前数据库备份 — 用户数据库有变更时才备份，保留最近 7 天
 * 备份位置: server/data/backups/
 *
 * 触发条件：
 *   1. 从未备份过
 *   2. 任一用户数据库在上次备份之后被修改过
 */
import { mkdirSync, readdirSync, unlinkSync, statSync, copyFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../server/data");
const BACKUP_DIR = join(DATA_DIR, "backups");
const RETENTION_DAYS = 7;

const DB_FILES = ["patent-examiner.db", "knowledge.db"];

/** 获取最新的备份文件的 mtime，无备份返回 0 */
function latestBackupMtime() {
  try {
    let latest = 0;
    for (const f of readdirSync(BACKUP_DIR)) {
      if (!f.endsWith(".db")) continue;
      try {
        const m = statSync(join(BACKUP_DIR, f)).mtimeMs;
        if (m > latest) latest = m;
      } catch { /* ignore */ }
    }
    return latest;
  } catch {
    return 0;
  }
}

/** 检查是否有任一用户数据库比最新备份更新 */
function hasChanges() {
  const backupTime = latestBackupMtime();
  if (backupTime === 0) return true; // 从未备份过

  for (const dbFile of DB_FILES) {
    try {
      const m = statSync(join(DATA_DIR, dbFile)).mtimeMs;
      if (m > backupTime) return true;
    } catch { /* 文件不存在则跳过 */ }
  }
  return false;
}

/** 清理超过 RETENTION_DAYS 天的备份，但每个数据库至少保留最新 1 份 */
function cleanOldBackups() {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  try {
    // 按数据库类型分组：patent-examiner-* 和 knowledge-*
    const groups = { "patent-examiner": [], knowledge: [] };
    for (const f of readdirSync(BACKUP_DIR)) {
      for (const prefix of Object.keys(groups)) {
        if (f.startsWith(prefix) && f.endsWith(".db")) {
          groups[prefix].push({ name: f, mtime: statSync(join(BACKUP_DIR, f)).mtimeMs });
        }
      }
    }

    for (const files of Object.values(groups)) {
      files.sort((a, b) => b.mtime - a.mtime); // 最新在前
      // 跳过第一个（最新），其余超期的删除
      for (const f of files.slice(1)) {
        if (f.mtime < cutoff) {
          try { unlinkSync(join(BACKUP_DIR, f.name)); } catch { /* ignore */ }
        }
      }
    }
  } catch { /* dir may not exist yet */ }
}

/**
 * 执行备份。仅在数据库有变更时才备份，保留最近 7 天。
 * @returns {boolean} 是否实际执行了备份
 */
export function backupDatabases() {
  // 每次运行都清理过期备份（即使本次不需要备份）
  cleanOldBackups();

  if (!hasChanges()) return false;

  mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  for (const dbFile of DB_FILES) {
    const src = join(DATA_DIR, dbFile);
    const dest = join(BACKUP_DIR, dbFile.replace(".db", `-${ts}.db`));
    try {
      copyFileSync(src, dest);
    } catch (e) {
      if (e.code !== "ENOENT") console.error(`[backup] failed for ${dbFile}:`, e.message);
    }
  }

  return true;
}
