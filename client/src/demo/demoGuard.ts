/**
 * 一键演示安全守卫（demoGuard）
 *
 * 演示期间安装 window.fetch 拦截器，硬保证不触发任何外部 API 调用
 * （LLM / 搜索 / Embedding / Rerank / 网页抓取）。
 * 本地 DB 读写（/api/data/*、GET /api/metrics/*、GET /api/knowledge/*）不受影响。
 */

declare global {
  interface Window {
    __DEMO_MODE__?: boolean;
  }
}

/** 可能触发外部 API 的端点（演示期间一律拦截） */
const BLOCKED_PATTERNS: RegExp[] = [
  /\/api\/agent\/run/, // LLM（server 端还可能联动知识库 embedding/rerank、联网搜索）
  /\/api\/ai\/run/, // 旧版 LLM 入口
  /\/api\/extract-search-terms/, // LLM 提取检索词
  /\/api\/search-with-terms/, // 外部搜索 provider
  /\/api\/search-references/, // 外部搜索 provider
  /\/api\/verify-search-key/, // 外部搜索 key 验证
  /\/api\/knowledge\/search/, // embedding + reranker
  /\/api\/knowledge\/upload/, // embedding
  /\/api\/knowledge\/import-url/, // 外部网页抓取 + embedding
  /\/api\/knowledge\/providers\/test/, // embedding/reranker 端点连通性测试
  /\/api\/metrics\/eval\/run/, // 离线评估全管线（LLM + 搜索 + embedding）
  /\/api\/metrics\/eval-sets\/generate/, // LLM 生成评估题
  /\/api\/metrics\/eval-sets\/[^/]+\/quality-check/, // LLM judge
  /\/api\/providers\/[^/]+\/models/, // 拉取 provider 远端模型列表
  /\/api\/providers\/[^/]+\/verify-model/, // 验证模型连通性
  /\/api\/documents\/extract-from-url/, // server 代理抓取外部网页
];

let originalFetch: typeof window.fetch | null = null;
const blockedCalls: string[] = [];

export function isDemoMode(): boolean {
  return window.__DEMO_MODE__ === true;
}

/** 演示期间被拦截的外部调用 URL 列表（用于调试/展示） */
export function getBlockedCalls(): readonly string[] {
  return blockedCalls;
}

export function installDemoGuard(): void {
  if (originalFetch) return; // 已安装
  window.__DEMO_MODE__ = true;
  blockedCalls.length = 0;
  const bound = window.fetch.bind(window);
  originalFetch = bound;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (BLOCKED_PATTERNS.some((p) => p.test(url))) {
      blockedCalls.push(url);
      console.info(`[demo] 已拦截外部 API 调用: ${url}`);
      return new Response(
        JSON.stringify({
          ok: false,
          error: "演示模式：已拦截外部 API 调用，请退出演示后重试。",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
    return bound(input, init);
  };
}

export function uninstallDemoGuard(): void {
  if (!originalFetch) return;
  window.fetch = originalFetch;
  originalFetch = null;
  delete window.__DEMO_MODE__;
  if (blockedCalls.length > 0) {
    console.info(`[demo] 演示期间共拦截 ${blockedCalls.length} 次外部 API 调用`);
  }
}
