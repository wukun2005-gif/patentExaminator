/**
 * E2E 测试重试逻辑
 * =================
 *
 * 统一的重试机制，包括：
 * - 可重试错误判断
 * - Fallback 模型管理
 * - 指数退避延迟
 */

import {
  RETRYABLE_ERROR_KEYWORDS,
  GEMINI_FALLBACK_MODELS,
  OPENROUTER_FALLBACK_MODELS,
  OPENROUTER_MAX_ATTEMPTS_PER_MODEL,
  RETRY_BASE_DELAY,
  RETRY_DELAY_INCREMENT,
} from "./config.mjs";

// ── 延迟工具 ────────────────────────────────────────────────────────

/**
 * 延迟指定毫秒
 */
export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 计算线性退避延迟（base + attempt * increment）
 */
export function getLinearBackoff(attempt, baseMs = RETRY_BASE_DELAY) {
  return baseMs + attempt * RETRY_DELAY_INCREMENT;
}

// ── 错误判断 ────────────────────────────────────────────────────────

/**
 * 判断是否为可重试的错误（基于错误消息文本）
 */
export function isRetryableError(text = "") {
  const lower = String(text).toLowerCase();
  return RETRYABLE_ERROR_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/**
 * 判断是否为认证错误（401/403）
 */
export function isAuthError(status) {
  return status === 401 || status === 403;
}

/**
 * 判断是否为配额错误
 */
export function isQuotaError(text = "") {
  const lower = String(text).toLowerCase();
  return lower.includes("配额不足") || lower.includes("resource_exhausted");
}

// ── Fallback 模型管理 ────────────────────────────────────────────────

/**
 * Fallback 模型管理器
 */
export class FallbackModelManager {
  constructor(models = [...GEMINI_FALLBACK_MODELS]) {
    this.currentIndex = 0;
    this.models = models;
  }

  /**
   * 获取当前模型并推进到下一个
   */
  getNext() {
    if (this.currentIndex >= this.models.length) {
      throw new Error("All fallback models exhausted");
    }
    const model = this.models[this.currentIndex];
    this.currentIndex++;
    return model;
  }

  /**
   * 获取当前模型（不推进）
   */
  getCurrent() {
    if (this.currentIndex >= this.models.length) {
      throw new Error("All fallback models exhausted");
    }
    return this.models[this.currentIndex];
  }

  /**
   * 是否还有可用模型
   */
  hasMore() {
    return this.currentIndex < this.models.length;
  }

  /**
   * 重置索引
   */
  reset() {
    this.currentIndex = 0;
  }

  /**
   * 获取当前索引
   */
  getIndex() {
    return this.currentIndex;
  }

  /**
   * 获取模型总数
   */
  getTotal() {
    return this.models.length;
  }
}

/**
 * OpenRouter 模型管理器
 */
export class OpenRouterModelManager {
  constructor() {
    this.models = OPENROUTER_FALLBACK_MODELS;
    this.currentModelIndex = 0;
    this.currentAttempt = 0;
  }

  /**
   * 获取下一个模型（或当前模型的下一次重试）
   */
  getNext() {
    while (this.currentModelIndex < this.models.length) {
      const model = this.models[this.currentModelIndex];

      if (this.currentAttempt < OPENROUTER_MAX_ATTEMPTS_PER_MODEL) {
        const attempt = this.currentAttempt;
        this.currentAttempt++;
        return { id: model.id, label: model.label, attempt };
      }

      // 当前模型已用完所有重试次数，切换到下一个模型
      this.currentModelIndex++;
      this.currentAttempt = 0;
    }

    return null; // 所有模型都已尝试
  }

  /**
   * 是否还有可用模型
   */
  hasMore() {
    return this.currentModelIndex < this.models.length;
  }

  /**
   * 重置
   */
  reset() {
    this.currentModelIndex = 0;
    this.currentAttempt = 0;
  }
}

// ── 重试执行器 ──────────────────────────────────────────────────────

/**
 * 带重试的函数执行器
 */
export async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    delayMs = RETRY_BASE_DELAY,
    backoff = true,
    shouldRetry = (err) => isRetryableError(err.message),
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxRetries && shouldRetry(lastError)) {
        const waitMs = backoff ? getLinearBackoff(attempt, delayMs) : delayMs;
        console.log(`  [Retry] Attempt ${attempt + 1}/${maxRetries + 1} failed: ${lastError.message}, waiting ${waitMs}ms...`);
        await delay(waitMs);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error("Retry failed");
}
