import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ErrorBanner, formatAiErrorMessage } from "@client/lib/errorDisplay";
import { AiGatewayError } from "@client/agent/contracts";

describe("formatAiErrorMessage", () => {
  it("quota 类型返回配额消息", () => {
    const result = formatAiErrorMessage(new AiGatewayError("quota", "test"));
    expect(result.type).toBe("quota");
    expect(result.message).toContain("配额");
  });

  it("auth 类型返回认证消息", () => {
    const result = formatAiErrorMessage(new AiGatewayError("auth", "test"));
    expect(result.type).toBe("auth");
    expect(result.message).toContain("认证");
  });

  it("null 返回未知错误兜底", () => {
    const result = formatAiErrorMessage(null);
    expect(result.type).toBe("other");
    expect(result.message).toContain("未知错误");
  });

  it("字符串含 quota 关键词推断为配额", () => {
    const result = formatAiErrorMessage("额度已用尽");
    expect(result.type).toBe("quota");
  });

  it("普通 Error 对象返回其 message", () => {
    const result = formatAiErrorMessage(new Error("自定义错误"));
    expect(result.message).toBe("自定义错误");
    expect(result.type).toBe("other");
  });
});

describe("ErrorBanner", () => {
  it("quota 错误显示配额提示", () => {
    render(<ErrorBanner error={new AiGatewayError("quota", "test")} />);
    expect(screen.getByText(/配额/)).toBeInTheDocument();
    expect(screen.getByText(/Provider 额度/)).toBeInTheDocument();
  });

  it("auth 错误显示认证提示", () => {
    render(<ErrorBanner error={new AiGatewayError("auth", "test")} />);
    expect(screen.getByText(/认证/)).toBeInTheDocument();
    expect(screen.getByText(/API Key 是否正确配置/)).toBeInTheDocument();
  });

  it("timeout 错误显示超时提示", () => {
    render(<ErrorBanner error={new AiGatewayError("timeout", "test")} />);
    expect(screen.getByText(/超时/)).toBeInTheDocument();
  });

  it("network 错误显示网络提示", () => {
    render(<ErrorBanner error={new AiGatewayError("network", "test")} />);
    const items = screen.getAllByText(/网络/);
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it("structure 错误显示格式提示", () => {
    render(<ErrorBanner error={new AiGatewayError("structure", "test")} />);
    expect(screen.getByText(/格式/)).toBeInTheDocument();
  });

  it("other 错误显示未知提示", () => {
    render(<ErrorBanner error={new AiGatewayError("other", "test")} />);
    expect(screen.getByText(/未知/)).toBeInTheDocument();
  });

  it("compact 模式引导文案以内联形式展示", () => {
    render(<ErrorBanner error={new AiGatewayError("quota", "test")} compact />);
    expect(screen.getByText(/配额/)).toBeInTheDocument();
    const { container } = render(<ErrorBanner error={new AiGatewayError("quota", "test")} compact />);
    expect(container.querySelector("span")).toBeTruthy();
  });

  it("完整模式引导文案以 p 标签展示", () => {
    const { container } = render(<ErrorBanner error={new AiGatewayError("quota", "test")} />);
    expect(container.querySelector("p")).toBeTruthy();
  });

  it("透传 data-testid 属性", () => {
    render(<ErrorBanner error={new AiGatewayError("quota", "test")} data-testid="custom-error" />);
    expect(screen.getByTestId("custom-error")).toBeInTheDocument();
  });

  it("透传 className 属性", () => {
    const { container } = render(
      <ErrorBanner error={new AiGatewayError("quota", "test")} className="my-custom-class" />
    );
    expect(container.querySelector(".my-custom-class")).toBeInTheDocument();
  });

  it("接受 string 错误并推断类型", () => {
    render(<ErrorBanner error="AI 配额不足：429" />);
    expect(screen.getByText(/配额/)).toBeInTheDocument();
  });

  it("接受 null 错误并显示兜底提示", () => {
    render(<ErrorBanner error={null} />);
    expect(screen.getByText(/未知错误/)).toBeInTheDocument();
  });

  it("接受 undefined 错误显示兜底提示", () => {
    render(<ErrorBanner error={undefined} />);
    expect(screen.getByText(/未知错误/)).toBeInTheDocument();
  });

  it("接受 Error 对象并显示消息", () => {
    render(<ErrorBanner error={new Error("网络连接失败")} />);
    expect(screen.getByText("网络连接失败")).toBeInTheDocument();
  });

  it("quota 错误应用橙色边框", () => {
    const { container } = render(<ErrorBanner error={new AiGatewayError("quota", "test")} />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.getAttribute("style")).toContain("#e65100");
  });

  it("auth 错误应用红色边框", () => {
    const { container } = render(<ErrorBanner error={new AiGatewayError("auth", "test")} />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.getAttribute("style")).toContain("#c00");
  });

  it("compact 模式 padding 更小", () => {
    const { container } = render(<ErrorBanner error={new AiGatewayError("quota", "test")} compact />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.getAttribute("style")).toContain("6px 10px");
  });

  it("完整模式 padding 为标准", () => {
    const { container } = render(<ErrorBanner error={new AiGatewayError("quota", "test")} />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.getAttribute("style")).toContain("12px 16px");
  });
});