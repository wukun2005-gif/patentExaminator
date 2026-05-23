import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openDB, deleteDB } from "idb";

const DB_NAME = "test-upgrade-db";

describe("Minimal Upgrade", () => {
  afterEach(async () => {
    await deleteDB(DB_NAME).catch(() => {});
  });

  it("upgrade from v1 to v2", async () => {
    const db1 = await openDB(DB_NAME, 1, {
      upgrade(db) {
        const store = db.createObjectStore("test", { keyPath: "id" });
        store.createIndex("by-name", "name");
      }
    });
    await db1.put("test", { id: "1", name: "hello" });
    db1.close();

    const db2 = await openDB(DB_NAME, 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore("test", { keyPath: "id" });
          store.createIndex("by-name", "name");
        }
        if (oldVersion < 2) {
          const store = db.createObjectStore("test2", { keyPath: "id" });
          store.createIndex("by-value", "value");
        }
      }
    });

    const tx = db2.transaction("test", "readonly");
    const store = tx.objectStore("test");
    const indexes: string[] = [];
    for (let i = 0; i < store.indexNames.length; i++) {
      indexes.push(store.indexNames.item(i)!);
    }
    expect(indexes).toContain("by-name");

    const data = await db2.get("test", "1");
    expect(data).toBeDefined();
    expect(data!.name).toBe("hello");

    expect(db2.objectStoreNames.contains("test2")).toBe(true);

    db2.close();
  });
});