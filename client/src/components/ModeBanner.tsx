export function ModeBanner() {
  // Default to mock mode (no API key configured)
  const mode = "mock";

  return (
    <div
      className="mode-banner"
      data-testid="banner-mode"
      role="status"
      aria-label={mode === "mock" ? "演示模式" : "真实模式"}
    >
      {mode === "mock"
        ? "演示模式：所有 AI 输出为预置示例，不消耗 Token，不联网"
        : "真实模式：AI 调用将消耗 Token 并联网"}
    </div>
  );
}
