import "fake-indexeddb/auto";
import { describe, it, expect, afterEach } from "vitest";
import { openDB, deleteDB } from "idb";
import { setDBInstance } from "@client/lib/repos";

const DB_NAME = "patent-examiner-v1";

async function cleanupDB(): Promise<void> {
  setDBInstance(null);
  await deleteDB(DB_NAME).catch(() => {});
  const delReq = indexedDB.deleteDatabase(DB_NAME);
  await new Promise<void>((resolve) => {
    delReq.onsuccess = () => resolve();
    delReq.onerror = () => resolve();
  });
}

describe("Simplified Upgrade Sanity", () => {
  afterEach(async () => {
    await cleanupDB();
  });

  it("step1: create v1 DB and write data", async () => {
    const db = await openDB(DB_NAME, 1, {
      upgrade(db) {
        const store = db.createObjectStore("cases", { keyPath: "id" });
        store.createIndex("by-updatedAt", "updatedAt");
        db.createObjectStore("interpretSummaries", { keyPath: "caseId" });
      },
    });

    await db.put("cases", { id: "c1", title: "Test", updatedAt: "2023-01-01T00:00:00.000Z" });

    const cases = await db.getAll("cases");
    expect(cases).toHaveLength(1);

    db.close();
  });

  it("step2: create v1 DB, close, then openPatentDB at v7", async () => {
    const db1 = await openDB(DB_NAME, 1, {
      upgrade(db) {
        const store = db.createObjectStore("cases", { keyPath: "id" });
        store.createIndex("by-updatedAt", "updatedAt");
        db.createObjectStore("interpretSummaries", { keyPath: "caseId" });
      },
    });
    await db1.put("cases", { id: "c1", title: "Test", updatedAt: "2023-01-01T00:00:00.000Z" });
    db1.close();

    const { openPatentDB } = await import("@client/lib/repos");
    const db2 = await openPatentDB();
    setDBInstance(db2);

    const cases = await db2.getAll("cases");
    expect(cases).toHaveLength(1);
    expect(cases[0]!.id).toBe("c1");

    db2.close();
  });

  it("step3: create v1 DB, close, then openPatentDB via repo", async () => {
    const db1 = await openDB(DB_NAME, 1, {
      upgrade(db) {
        const store = db.createObjectStore("cases", { keyPath: "id" });
        store.createIndex("by-updatedAt", "updatedAt");
        db.createObjectStore("interpretSummaries", { keyPath: "caseId" });
      },
    });
    await db1.put("cases", { id: "c1", title: "Test", updatedAt: "2023-01-01T00:00:00.000Z" });
    db1.close();

    const { openPatentDB } = await import("@client/lib/repos");
    const db2 = await openPatentDB();
    setDBInstance(db2);

    const { readAllCases } = await import("@client/lib/repos");
    const cases = await readAllCases();
    expect(cases).toHaveLength(1);
    expect(cases[0]!.id).toBe("c1");

    db2.close();
  });
});