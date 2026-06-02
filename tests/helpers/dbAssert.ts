/**
 * IndexedDB Schema Assertion Helpers
 * ==================================
 *
 * 用于索引完整性检查和升级场景验证的可复用辅助函数。
 * lesson-learned-57: 测试失败时输出"缺少哪个索引"而非让开发者去抓 log。
 */

import type { IDBPDatabase, StoreNames } from "idb";
import type { PatentExaminerDB } from "@client/lib/repos";

type StoreName = StoreNames<PatentExaminerDB>;

export interface IndexCheckResult {
  storeName: string;
  pass: boolean;
  missing: string[];
  extra: string[];
  actual: string[];
  expected: string[];
}

export async function assertStoreIndexes(
  db: IDBPDatabase<PatentExaminerDB>,
  storeName: StoreName,
  expectedIndexes: string[]
): Promise<IndexCheckResult> {
  const tx = db.transaction(storeName, "readonly");
  const store = tx.objectStore(storeName);
  const actualIndexes: string[] = [];
  for (let i = 0; i < store.indexNames.length; i++) {
    actualIndexes.push(store.indexNames.item(i)!);
  }
  await tx.done;

  const expectedSet = new Set(expectedIndexes);
  const actualSet = new Set(actualIndexes);

  const missing = expectedIndexes.filter((i) => !actualSet.has(i));
  const extra = actualIndexes.filter((i) => !expectedSet.has(i));

  return {
    storeName: storeName as string,
    pass: missing.length === 0 && extra.length === 0,
    missing,
    extra,
    actual: actualIndexes,
    expected: expectedIndexes,
  };
}

export function formatIndexCheckErrors(results: IndexCheckResult[]): string {
  const failed = results.filter((r) => !r.pass);

  if (failed.length === 0) return "";

  const lines: string[] = [];
  lines.push(`\nIndex check failures: ${failed.length}/${results.length}\n`);

  for (const r of failed) {
    lines.push(`  Store "${r.storeName}":`);
    if (r.missing.length > 0) {
      lines.push(`    Missing indexes: [${r.missing.join(", ")}]`);
    }
    if (r.extra.length > 0) {
      lines.push(`    Unexpected indexes: [${r.extra.join(", ")}]`);
    }
    lines.push(`    Actual indexes:   [${r.actual.join(", ")}]`);
    lines.push(`    Expected indexes: [${r.expected.join(", ")}]`);
    lines.push("");
  }

  lines.push("  Suggested fix:");
  lines.push("  1. Check if DB_VERSION is incremented");
  lines.push("  2. Check if upgrade callback handles oldVersion < newVersion correctly");
  lines.push("  3. Check if store is deleted and recreated with new indexes in upgrade");
  lines.push("  4. Check indexedDb.ts DBSchema interface matches the upgrade callback\n");

  return lines.join("\n");
}

export const EXPECTED_SCHEMA_V7: Record<string, string[]> = {
  cases: ["by-updatedAt"],
  interpretSummaries: [],
  documents: ["by-caseId", "by-role", "by-fileHash"],
  textIndex: [],
  claimNodes: ["by-caseId"],
  claimCharts: ["by-caseId", "by-claimNumber"],
  novelty: ["by-caseId", "by-referenceId"],
  inventive: ["by-caseId"],
  defects: ["by-caseId"],
  ocrCache: [],
  chatMessages: ["by-caseId", "by-moduleScope", "by-createdAt", "by-sessionId"],
  chatSessions: ["by-caseId"],
  feedback: ["by-caseId", "by-subjectType", "by-subjectId"],
  settings: [],
  opinionAnalyses: ["by-caseId"],
  argumentMappings: ["by-caseId"],
  reexamDrafts: [],
  summaries: [],
};

export async function assertAllStoreIndexes(
  db: IDBPDatabase<PatentExaminerDB>,
  expectedSchema: Record<string, string[]> = EXPECTED_SCHEMA_V7
): Promise<IndexCheckResult[]> {
  const results: IndexCheckResult[] = [];

  for (const [storeName, expectedIndexes] of Object.entries(expectedSchema)) {
    const result = await assertStoreIndexes(
      db,
      storeName as StoreName,
      expectedIndexes
    );
    results.push(result);
  }

  return results;
}