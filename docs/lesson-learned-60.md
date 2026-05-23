# Lesson Learned #60: 用户离开页面后 Agent 请求未取消

## 问题现象

用户在文档解读页面触发解读后，离开页面进入其他业务环节，但 server 日志显示 `interpret` agent 仍在不断向 AI API 发送请求（每 2-3 秒一次），导致其他 agent 请求被阻塞。

## 根因分析

1. **InterpretPanel 组件在 useEffect 中自动触发解读**：对于没有持久化摘要的文档，组件挂载时会自动调用 `doInterpret`
2. **没有取消机制**：React 组件卸载时，正在进行的 `fetch` 请求不会自动取消
3. **组件可能多次重新挂载**：路由切换或页面重新渲染时，会重新触发解读

## 修复方案

### 1. 组件级 AbortController 管理

```tsx
// InterpretPanel.tsx
const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
const isMountedRef = useRef(true);

useEffect(() => {
  isMountedRef.current = true;
  return () => {
    isMountedRef.current = false;
    // Abort all in-flight requests on unmount
    abortControllersRef.current.forEach((controller, docId) => {
      controller.abort();
      console.log(`[InterpretPanel] Aborted request for document ${docId} on unmount`);
    });
    abortControllersRef.current.clear();
  };
}, []);
```

### 2. 在请求处理中检查取消状态

```tsx
const doInterpret = useCallback(async (doc: InterpretableDocument) => {
  // Cancel any existing request for this document
  const existingController = abortControllersRef.current.get(doc.id);
  if (existingController) {
    existingController.abort();
  }

  // Create new AbortController for this request
  const controller = new AbortController();
  abortControllersRef.current.set(doc.id, controller);

  try {
    const response = await runInterpret(doc, relatedDocs, { signal: controller.signal });
    
    // Check if component is still mounted and request wasn't aborted
    if (!isMountedRef.current || controller.signal.aborted) {
      return;
    }
    // ... update state
  } catch (err) {
    // Don't show error if request was aborted
    if (controller.signal.aborted) {
      return;
    }
    // ... handle other errors
  }
}, [deps]);
```

### 3. AgentClient 支持 AbortSignal

```ts
// contracts.ts
export interface AgentRunOptions {
  signal?: AbortSignal | null;
}

// AgentClient.ts
private async callGateway<T>(..., meta: { ..., signal?: AbortSignal | null }) {
  const res = await fetch(url, {
    ...,
    ...(meta.signal ? { signal: meta.signal } : {})
  });
}
```

## 关键 Takeaway

**所有长时间运行的 AI 请求都必须支持 AbortController**：
- 组件级：在 `useEffect` cleanup 中取消请求
- API 级：`fetch` 调用传递 `signal` 参数
- 状态管理：检查 `isMounted` 和 `aborted` 状态后再更新 UI

## 遗留问题

其他 agent（claim-chart, novelty, inventive 等）同样存在此问题，但它们的触发频率较低，用户通常会在页面上等待结果完成。文档解读是唯一会自动批量触发多个请求的场景。如需要，可按相同模式修复其他 agent。