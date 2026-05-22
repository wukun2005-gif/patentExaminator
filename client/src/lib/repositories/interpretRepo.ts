import { getDB } from "../indexedDb.js";

interface LegacyInterpretSummaryRecord {
  caseId: string;
  summary: string;
  updatedAt: string;
}

interface InterpretSummariesRecord {
  caseId: string;
  summaries: Record<string, string>;
  updatedAt: string;
}

type InterpretSummaryRecord = LegacyInterpretSummaryRecord | InterpretSummariesRecord;

export async function saveInterpretSummaries(
  caseId: string,
  summaries: Record<string, string>
): Promise<void> {
  const db = await getDB();
  const record: InterpretSummariesRecord = {
    caseId,
    summaries,
    updatedAt: new Date().toISOString()
  };
  await db.put("interpretSummaries", record);
}

export async function readInterpretSummaries(caseId: string): Promise<Record<string, string>> {
  const db = await getDB();
  const record = await db.get("interpretSummaries", caseId) as InterpretSummaryRecord | undefined;
  if (!record) return {};
  if ("summaries" in record) {
    return record.summaries;
  }
  return record.summary ? { __legacy__: record.summary } : {};
}

export async function deleteInterpretSummaries(caseId: string): Promise<void> {
  const db = await getDB();
  await db.delete("interpretSummaries", caseId);
}
