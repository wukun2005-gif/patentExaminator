import { useState, useEffect } from "react";

function detectBrowser(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (ua.includes("Firefox/")) return "firefox";
  if (ua.includes("Edg/")) return "edge";
  if (ua.includes("Chrome/")) return "chrome";
  if (ua.includes("Safari/")) return "safari";
  return "unknown";
}

export function BrowserNotice() {
  const [browser, setBrowser] = useState<string>("unknown");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setBrowser(detectBrowser());
  }, []);

  if (browser !== "firefox" || dismissed) return null;

  return (
    <div className="browser-notice" data-testid="browser-notice">
      <p>
        您正在使用 Firefox 浏览器。本应用在 Chrome/Edge 上体验更佳，部分功能可能存在兼容性问题。
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        data-testid="btn-dismiss-browser-notice"
      >
        知道了
      </button>
    </div>
  );
}
