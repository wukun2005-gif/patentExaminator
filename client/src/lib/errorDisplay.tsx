import React from "react";
import { AiGatewayError, type AiErrorType } from "../agent/contracts";

export interface FormattedError {
  message: string;
  guidance: string;
  type: AiErrorType;
}

export function formatAiErrorMessage(error: unknown): FormattedError {
  if (error instanceof AiGatewayError) {
    switch (error.type) {
      case "quota":
        return {
          message: "AI 配额不足，服务已用尽",
          guidance: "请在设置中检查 Provider 额度，或切换到演示模式。",
          type: "quota"
        };
      case "auth":
        return {
          message: "API Key 认证失败，无效或未配置",
          guidance: "请在设置页面中检查 API Key 是否正确配置。",
          type: "auth"
        };
      case "network":
        return {
          message: "AI 服务网络异常，暂时不可用",
          guidance: "请检查网络连接或稍后重试，也可切换到演示模式继续体验。",
          type: "network"
        };
      case "timeout":
        return {
          message: "AI 服务响应超时",
          guidance: "网络可能不稳定，请稍后重试或切换到演示模式。",
          type: "timeout"
        };
      case "structure":
        return {
          message: "AI 返回格式异常",
          guidance: "请确认 AI Provider 配置正确，或切换到演示模式。",
          type: "structure"
        };
      default:
        return {
          message: "未知错误：" + (error.message || "AI 服务异常"),
          guidance: "请检查设置或切换到演示模式。",
          type: "other"
        };
    }
  }

  const rawMsg = error instanceof Error ? error.message : String(error ?? "");
  const msg = rawMsg.toLowerCase();

  if (msg.includes("quota") || msg.includes("429") || msg.includes("额度")) {
    return { message: "AI 配额不足，服务不可用", guidance: "请在设置中检查 Provider 额度，或切换到演示模式。", type: "quota" };
  }
  if (msg.includes("auth") || msg.includes("401") || msg.includes("key") || msg.includes("api")) {
    return { message: "API Key 无效或未配置", guidance: "请在设置页面中检查 API Key 是否正确配置。", type: "auth" };
  }
  if (msg.includes("timeout") || msg.includes("超时")) {
    return { message: "AI 服务响应超时", guidance: "网络可能不稳定，请稍后重试或切换到演示模式。", type: "timeout" };
  }
  if (msg.includes("network") || msg.includes("econn") || msg.includes("eaddr") || msg.includes("epipe") || msg.includes("server-error") || /\b5\d\d\b/.test(rawMsg)) {
    return { message: "AI 服务暂时不可用", guidance: "请检查网络连接或稍后重试，也可切换到演示模式继续体验。", type: "network" };
  }

  if (error == null) {
    return {
      message: "AI 服务发生未知错误",
      guidance: "请检查设置或切换到演示模式。",
      type: "other"
    };
  }

  return {
    message: rawMsg.length > 0 ? rawMsg : "AI 服务发生未知错误",
    guidance: "请检查设置或切换到演示模式。",
    type: "other"
  };
}

const ERROR_COLORS: Record<string, string> = {
  quota: "#e65100",
  auth: "#c00",
  timeout: "#c00",
  network: "#c00",
  structure: "#c00",
  other: "#c00"
};

interface ErrorBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  error: unknown;
  compact?: boolean;
}

export function ErrorBanner({ error, compact, ...rest }: ErrorBannerProps) {
  const formatted = formatAiErrorMessage(error);

  const color = ERROR_COLORS[formatted.type] ?? "#c00";

  if (compact) {
    return (
      <div
        {...rest}
        style={{
          background: "#fff3f3",
          border: `1px solid ${color}`,
          borderRadius: 4,
          padding: "6px 10px",
          margin: "4px 0",
          fontSize: "0.9em",
          ...rest.style
        }}
      >
        <strong style={{ color }}>{formatted.message}</strong>
        <span style={{ color: "#666", marginLeft: 8 }}>{formatted.guidance}</span>
      </div>
    );
  }

  return (
    <div
      {...rest}
      style={{
        background: "#fff3f3",
        border: `1px solid ${color}`,
        borderRadius: 6,
        padding: "12px 16px",
        marginBottom: 16,
        color,
        ...rest.style
      }}
    >
      <strong style={{ fontSize: "1.1em" }}>{formatted.message}</strong>
      <p style={{ margin: "4px 0 0", color: "#666", fontSize: "0.9em" }}>{formatted.guidance}</p>
    </div>
  );
}