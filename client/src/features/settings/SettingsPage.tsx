import { useState } from "react";
import { ProvidersConfigPanel } from "./ProvidersConfigPanel";
import { AgentsAssignmentPanel } from "./AgentsAssignmentPanel";

type Tab = "providers" | "agents";

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>("providers");

  return (
    <div className="settings-page" data-testid="settings-page">
      <h2>设置</h2>
      <p className="settings-page__desc">
        配置 AI 模型连接（真实模式需要），以及各功能使用哪个模型。
      </p>

      <div className="settings-tabs">
        <button
          type="button"
          className={`settings-tab ${tab === "providers" ? "settings-tab--active" : ""}`}
          onClick={() => setTab("providers")}
          data-testid="tab-providers"
        >
          模型连接
        </button>
        <button
          type="button"
          className={`settings-tab ${tab === "agents" ? "settings-tab--active" : ""}`}
          onClick={() => setTab("agents")}
          data-testid="tab-agents"
        >
          功能分配
        </button>
      </div>

      <div className="settings-content">
        {tab === "providers" && <ProvidersConfigPanel />}
        {tab === "agents" && <AgentsAssignmentPanel />}
      </div>
    </div>
  );
}
