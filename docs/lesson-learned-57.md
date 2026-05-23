# Lesson Learned: Feature 57 聊天记录持久化问题

**日期:** 2026-05-23
**Feature:** #57 chat panel 聊天记录无法持久化
**修复提交:** ad766eb

---

## 问题概述

用户报告：聊天记录在刷新页面后丢失，不会随着案件历史加载而恢复。经过多轮修复尝试，问题始终未解决。

---

## 根因分析

### 1. IndexedDB 事务机制错误

| 层面 | 问题 | 影响 |
|------|------|------|
| **事务限制** | 在 `upgrade` 回调中不能创建新事务，只能在同一个事务内完成所有 schema 变更 | 之前的修复尝试用 `db.deleteObjectStore()` + `db.createObjectStore()` 在 upgrade 事件中创建新事务，导致 `InvalidStateError` |
| **索引添加限制** | 不能给已存在的 store 添加新索引，必须删除后重建 | 旧代码尝试直接 `createIndex()` 在已存在的 store 上，失败 |
| **测试覆盖不足** | `tests/integration/chatPersistence.test.ts` 只测试了新用户场景，未覆盖从旧版本升级的场景 | 老用户（浏览器已有旧 IndexedDB）升级后 schema 未更新，但测试没发现这个问题 |
| **环境差异** | 开发者浏览器可能清除过数据（或使用无痕模式），而用户浏览器保留了旧 IndexedDB 数据 | 开发环境无法复现生产环境的问题 |

**关键发现：这与浏览器版本无关，而是与 IndexedDB 数据的"脏状态"（已有旧版本 schema）有关。**

### 2. 代码层面的根因

```typescript
// 错误的升级方式（之前的修复尝试）
upgrade(db) {
  if (!db.objectStoreNames.contains("chatMessages")) {
    // 这段代码只在 store 不存在时执行
    // 对于已有旧版本 IndexedDB 的用户，这段代码被跳过
    // 导致 by-sessionId 索引永远无法创建
  }
}
```

### 3. 正确的升级方式

```typescript
// 正确的升级方式：使用 oldVersion 参数
upgrade(db, oldVersion) {
  if (oldVersion < 7) {
    // 必须删除后重建，无法在已存在的 store 上添加索引
    db.deleteObjectStore("chatMessages");
    const chatStore = db.createObjectStore("chatMessages", { keyPath: "id" });
    chatStore.createIndex("by-caseId", "caseId");
    chatStore.createIndex("by-moduleScope", "moduleScope");
    chatStore.createIndex("by-createdAt", "createdAt");
    chatStore.createIndex("by-sessionId", "sessionId");  // 新增索引
  }
}
```

---

## 工具使用问题：`replace_in_file` 返回 `+++++++ REPLACE` 文本

### 问题描述

在执行 `replace_in_file` 时，工具返回的 `final_file_content` 显示了 `+++++++ REPLACE` 标记文本，而非实际写入后的文件内容。这导致：

1. 无法确认修改是否成功应用
2. 可能导致后续修改基于错误的文件内容
3. 浪费大量时间在调试"修改未生效"的问题上

### 防治方法

1. **不要信任 `replace_in_file` 的返回结果** — 每次修改后，用 `read_file` 或 `git diff` 验证实际文件内容
2. **在不信任时使用 `write_to_file`** — 对于复杂或大型修改，直接使用 `write_to_file` 覆盖整个文件
3. **创建 Shell 验证脚本** — 每次修改关键文件后，运行验证脚本确保内容正确

### 推荐的工具使用流程

```markdown
1. 执行 replace_in_file
2. [不信任返回结果] 执行 git diff <file> 或 read_file <file> 验证
3. 如果发现异常，执行 git checkout <file> 恢复，然后重试
```

---

## 改进建议：如何在 `/dev-iterate` skill 中防止类似问题

### A. 增强测试覆盖升级场景

```typescript
// tests/integration/chatPersistence.test.ts 应增加：
test("upgrade from DB_VERSION=6 to 7 preserves chat functionality", async () => {
  // 1. 模拟旧版本 schema（version 6）
  // 2. 插入旧版本数据
  // 3. 触发 upgrade 到 version 7
  // 4. 验证：新索引可用、旧数据不丢失（或符合预期的数据迁移行为）
});
```

### B. 增加 IndexedDB Schema 版本验证日志

```typescript
export async function openPatentDB(): Promise<IDBPDatabase<PatentExaminerDB>> {
  return openDB<PatentExaminerDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion) {
      console.log(`[IndexedDB] Upgrading from v${oldVersion} to v${newVersion}`);
      // ... 现有升级逻辑
    },
  });
}
```

### C. 修改 `/dev-iterate` skill 规则

```markdown
## 数据库相关 Bug 修复规则

### P0: IndexedDB/数据库 Schema 变更必须：
1. **增加 DB_VERSION 号**
2. **在 upgrade 回调中处理 oldVersion < newVersion 的增量升级**
3. **删除已存在的 store 前，必须考虑数据迁移**
4. **编写"从旧版本升级"的集成测试**（模拟用户从旧版本 schema 升级的场景）
5. **验证用户的脏数据环境**（不清除 IndexedDB 的情况下测试）

### P1: 持久化相关修复必须：
1. **检查 Repo 文件的 CRUD 操作是否正确调用 IndexedDB**
2. **检查 IndexedDB store 定义和索引是否完整**
3. **检查组件是否在加载时从 Repo 读取历史数据**
4. **用户验证：不清除浏览器数据的情况下刷新页面**
```

### D. 增加自动化验证脚本

```bash
#!/bin/bash
# scripts/verify-indexeddb-schema.sh
# 验证 IndexedDB schema 定义和实际使用的一致性

echo "Checking IndexedDB stores..."
grep -r "createObjectStore" client/src/lib/indexedDb.ts | wc -l

echo "Checking repo usage..."
grep -r "db.put\|db.get\|db.getAll" client/src/lib/repositories/*.ts

echo "Checking DB_VERSION..."
grep "DB_VERSION" client/src/lib/indexedDb.ts

echo "Verifying all stores have corresponding repos..."
for store in $(grep "createObjectStore" client/src/lib/indexedDb.ts | sed 's/.*"\([^"]*\)".*/\1/'); do
  if ! grep -r "$store" client/src/lib/repositories/*.ts > /dev/null 2>&1; then
    echo "WARNING: Store '$store' has no corresponding repo file"
  fi
done
```

---

## 核心教训总结

| 原则 | 具体做法 |
|------|---------|
| **验证脏数据环境** | 修复持久化问题后，必须在"不清除浏览器数据"的情况下测试 |
| **编写升级测试** | 集成测试必须覆盖"从旧版本 schema 升级"的场景 |
| **不信任工具返回** | `replace_in_file` 后必须用 `git diff` 或 `read_file` 验证 |
| **Schema 变更要谨慎** | IndexedDB store 删除/重建会丢失数据，需评估数据迁移策略 |
| **日志先行** | 在 upgrade 回调中添加日志，方便排查版本升级问题 |
| **使用 oldVersion 参数** | upgrade 回调必须使用 `oldVersion` 参数实现增量升级 |

---

## 关键洞察

**测试环境太"干净"，没有模拟用户保留旧数据的真实场景。**

下次修复类似问题时，需要：
1. 检查用户环境是否有"脏数据"（旧版本 schema）
2. 编写覆盖升级场景的测试
3. 使用 `git diff` 验证文件修改结果
4. 在不清除浏览器数据的情况下测试

---

## 相关文件

- `client/src/lib/indexedDb.ts` — IndexedDB schema 定义
- `client/src/lib/repositories/chatRepo.ts` — 聊天记录持久化
- `tests/integration/chatPersistence.test.ts` — 聊天持久化集成测试

---

## 附录：其他环节的潜在隐患

### 问题：所有 store 都使用了"仅创建不升级"模式

当前 `indexedDb.ts` 中所有 store 的创建逻辑都是：

```typescript
if (!db.objectStoreNames.contains("xxx")) {
  // 创建 store + 索引
}
```

**这个模式只处理了"新用户"场景，没有处理"旧用户升级"场景。**

### 受影响的 Store 列表

| Store | 已有索引 | 潜在隐患 |
|-------|---------|---------|
| `claimCharts` | `by-caseId`, `by-claimNumber` | 如果未来需要按 `featureId` 查询，无法添加新索引 |
| `novelty` | `by-caseId`, `by-referenceId` | 如果未来需要按 `claimNumber` 查询，无法添加新索引 |
| `inventive` | `by-caseId` | 如果未来需要按 `referenceId` 查询，无法添加新索引 |
| `defects` | `by-caseId` | 如果未来需要按 `category` 查询，无法添加新索引 |
| `opinionAnalyses` | `by-caseId` | 复审新增 store，如果需要新索引，会有同样问题 |
| `argumentMappings` | `by-caseId` | 同上 |
| `feedback` | `by-caseId`, `by-subjectType`, `by-subjectId` | 如果未来需要新索引，无法添加 |

### 根治方案：改为增量升级模式

```typescript
upgrade(db, oldVersion) {
  // Version 1: 初始 stores
  if (oldVersion < 1) {
    // 创建所有基础 stores...
  }

  // Version 7: chatMessages 添加 by-sessionId 索引
  if (oldVersion < 7) {
    // 删除后重建，带新索引
  }

  // 未来版本升级示例：
  // if (oldVersion < 8) {
  //   // 给 novelty 添加新索引
  //   if (db.objectStoreNames.contains("novelty")) {
  //     db.deleteObjectStore("novelty");
  //   }
  //   const noveltyStore = db.createObjectStore("novelty", { keyPath: "id" });
  //   noveltyStore.createIndex("by-caseId", "caseId");
  //   noveltyStore.createIndex("by-referenceId", "referenceId");
  //   noveltyStore.createIndex("by-claimNumber", "claimNumber"); // 新增
  // }
}
```

### 预防措施

1. **每次新增 store 索引时**，必须使用 `oldVersion` 检查
2. **编写升级测试**：模拟从旧版本 schema 升级的场景
3. **考虑数据迁移**：删除 store 会丢失数据，需要在 upgrade 前备份

---

## 自动测试缺失分析：为什么需要人类抓 log 才能找到 root cause？

### 问题回顾

本次 bug-fix 花费大量时间，最终是靠用户**手动复现 bug 并抓 console log** 才找到 root cause。这暴露了自动测试的严重缺失。

### 为什么自动测试没发现这个问题？

| 测试类型 | 应该覆盖什么 | 实际缺失了什么 |
|---------|-------------|---------------|
| **集成测试** | 从旧版本 IndexedDB 升级到新版本 | 只测试了"新用户"场景（空数据库），未测试"老用户升级"场景 |
| **Repo 层测试** | CRUD 操作的完整链路 | 测试了功能正确性，但未测试索引完整性 |
| **端到端测试** | 用户实际操作流程 | mock 数据太"干净"，未模拟脏数据环境 |

### 复现流程完全可以自动化

用户复现 bug 的步骤：
1. 打开老版本应用（DB_VERSION=6）
2. 创建聊天记录并保存
3. 部署新版本（DB_VERSION=7）
4. 刷新页面，观察聊天记录是否加载
5. 打开 DevTools → Application → IndexedDB，查看 `chatMessages` store 的索引
6. Console 输出 `InvalidStateError` 或索引缺失

**这些步骤完全可以通过底层逻辑函数调用实现：**

```typescript
// tests/integration/dbUpgrade.test.ts

import { openDB, deleteDB } from "idb";
import { openPatentDB, DB_VERSION } from "@/lib/indexedDb";

describe("IndexedDB Upgrade Scenarios", () => {
  const DB_NAME = "patent-examiner-v1";

  // 模拟旧版本 schema (DB_VERSION=6)
  async function createOldVersionDatabase() {
    await deleteDB(DB_NAME);
    const oldDb = await openDB(DB_NAME, 6, {
      upgrade(db) {
        // 创建 DB_VERSION=6 时的 schema（缺少 by-sessionId 索引）
        const chatStore = db.createObjectStore("chatMessages", { keyPath: "id" });
        chatStore.createIndex("by-caseId", "caseId");
        chatStore.createIndex("by-moduleScope", "moduleScope");
        chatStore.createIndex("by-createdAt", "createdAt");
        // 注意：没有 by-sessionId 索引
      },
    });
    return oldDb;
  }

  test("upgrade from v6 to v7: by-sessionId index should be added", async () => {
    // 1. 创建旧版本数据库
    const oldDb = await createOldVersionDatabase();

    // 2. 插入测试数据
    await oldDb.put("chatMessages", {
      id: "msg-1",
      caseId: "case-1",
      sessionId: "session-1",
      content: "test message",
      createdAt: new Date().toISOString(),
    });
    oldDb.close();

    // 3. 触发升级（调用 openPatentDB）
    const newDb = await openPatentDB();

    // 4. 验证：新索引存在
    const storeNames = Array.from(newDb.objectStoreNames);
    expect(storeNames).toContain("chatMessages");

    const tx = newDb.transaction("chatMessages", "readonly");
    const store = tx.objectStore("chatMessages");
    const indexNames = Array.from(store.indexNames);

    // 关键断言：by-sessionId 索引必须存在
    expect(indexNames).toContain("by-caseId");
    expect(indexNames).toContain("by-moduleScope");
    expect(indexNames).toContain("by-createdAt");
    expect(indexNames).toContain("by-sessionId"); // 🔑 如果这个断言失败，说明升级逻辑有 bug

    // 5. 验证：旧数据不丢失（或符合预期的数据迁移行为）
    const msg = await newDb.get("chatMessages", "msg-1");
    expect(msg).toBeDefined();
    expect(msg.content).toBe("test message");

    newDb.close();
  });

  test("all stores have expected indexes after upgrade", async () => {
    await openPatentDB();
    const db = await openPatentDB();

    const expectedStores = [
      { name: "cases", indexes: ["by-updatedAt"] },
      { name: "documents", indexes: ["by-caseId", "by-role", "by-fileHash"] },
      { name: "chatMessages", indexes: ["by-caseId", "by-moduleScope", "by-createdAt", "by-sessionId"] },
      { name: "claimCharts", indexes: ["by-caseId", "by-claimNumber"] },
      { name: "novelty", indexes: ["by-caseId", "by-referenceId"] },
      { name: "inventive", indexes: ["by-caseId"] },
      { name: "defects", indexes: ["by-caseId"] },
      { name: "opinionAnalyses", indexes: ["by-caseId"] },
      { name: "argumentMappings", indexes: ["by-caseId"] },
    ];

    for (const expected of expectedStores) {
      const tx = db.transaction(expected.name, "readonly");
      const store = tx.objectStore(expected.name);
      const indexNames = Array.from(store.indexNames);
      expect(indexNames.sort()).toEqual(expected.indexes.sort());
    }

    db.close();
  });
});
```

### 自动测试应该输出什么信息帮助定位问题？

当升级失败时，测试应该输出清晰的错误信息，而不是让开发者去抓 log：

```
❌ FAIL: upgrade from v6 to v7: by-sessionId index should be added

  Expected indexNames to contain: ["by-caseId", "by-moduleScope", "by-createdAt", "by-sessionId"]
  Actual indexNames: ["by-caseId", "by-moduleScope", "by-createdAt"]
  
  Missing indexes: ["by-sessionId"]
  
  Suggested fix:
  1. Check if DB_VERSION is incremented
  2. Check if upgrade callback handles oldVersion < newVersion correctly
  3. Check if store is deleted and recreated with new indexes

  IndexedDB upgrade log:
  - oldVersion: 6
  - newVersion: 7
  - upgrade callback executed: true
  - chatMessages store exists: true
  - Attempting to add by-sessionId index: NOT CALLED (upgrade logic may be skipped)
```

### 测试框架增强建议

1. **索引完整性检查函数**

```typescript
// tests/helpers/dbAssert.ts

export async function assertStoreIndexes(
  db: IDBPDatabase,
  storeName: string,
  expectedIndexes: string[]
): Promise<{ pass: boolean; missing: string[]; extra: string[] }> {
  const tx = db.transaction(storeName, "readonly");
  const store = tx.objectStore(storeName);
  const actualIndexes = Array.from(store.indexNames);

  const missing = expectedIndexes.filter(i => !actualIndexes.includes(i));
  const extra = actualIndexes.filter(i => !expectedIndexes.includes(i));

  return {
    pass: missing.length === 0 && extra.length === 0,
    missing,
    extra,
  };
}
```

2. **升级场景自动生成器**

```typescript
// tests/helpers/upgradeScenarios.ts

export function generateUpgradeTest(fromVersion: number, toVersion: number) {
  test(`upgrade from v${fromVersion} to v${toVersion}`, async () => {
    // 1. 创建旧版本数据库
    const oldDb = await createDatabaseAtVersion(fromVersion);

    // 2. 插入测试数据
    await seedTestData(oldDb, fromVersion);

    // 3. 触发升级
    const newDb = await openPatentDB();

    // 4. 验证所有 store 的索引
    for (const [store, indexes] of getExpectedSchema(toVersion)) {
      const result = await assertStoreIndexes(newDb, store, indexes);
      expect(result.pass).toBe(true);

      if (!result.pass) {
        console.error(`Store "${store}" index mismatch:`);
        console.error(`  Missing: ${result.missing.join(", ")}`);
        console.error(`  Extra: ${result.extra.join(", ")}`);
      }
    }

    // 5. 验证数据不丢失
    const data = await loadAllData(newDb);
    expect(data.length).toBeGreaterThan(0);
  });
}
```

### 核心教训：测试必须覆盖"升级场景"

| 规则 | 说明 |
|------|------|
| **不要只测"新用户"** | 自动测试往往从空数据库开始，这是"新用户"场景，但"老用户升级"才是最容易出问题的场景 |
| **模拟脏数据环境** | 测试应该模拟"用户浏览器中已有旧版本 IndexedDB"的状态 |
| **输出清晰的断言错误** | 测试失败时，应该输出"缺少哪个索引"、"哪个版本升级失败"等详细信息，而非让开发者去抓 log |
| **自动化索引检查** | 不依赖人工查看 DevTools，而是通过断言检查所有 store 的索引完整性 |

### 改进 `/dev-iterate` skill：增加升级测试规则

```markdown
## 数据库 Schema 变更测试规则

### P0: 必须编写升级测试

当修改 IndexedDB schema（新增 store、新增索引、修改索引）时，**必须**编写以下测试：

1. **从上一版本升级测试**：模拟用户从 `DB_VERSION-1` 升级到 `DB_VERSION`
2. **索引完整性断言**：验证所有 store 的索引列表与预期一致
3. **数据不丢失断言**：验证升级后旧数据仍然存在（或符合预期的迁移行为）

### P1: 测试必须输出清晰的错误信息

升级测试失败时，必须输出：
- 缺少哪些索引
- 多余哪些索引
- 建议的修复步骤

而非让开发者手动抓 console log。
```
