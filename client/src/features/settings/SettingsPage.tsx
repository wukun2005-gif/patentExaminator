import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ProvidersConfigPanel } from "./ProvidersConfigPanel";
import { AgentsAssignmentPanel } from "./AgentsAssignmentPanel";
import { SearchProvidersConfigPanel } from "./SearchProvidersConfigPanel";

type Tab = "providers" | "agents" | "search";

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>("providers");
  const navigate = useNavigate();

  return (
    <div className="settings-page" data-testid="settings-page">
      <div className="settings-page__header">
        <h2>设置</h2>
        <button
          type="button"
          className="btn-close-settings"
          onClick={() => navigate(-1)}
          aria-label="关闭设置"
          data-testid="btn-close-settings"
        >
          ✕
        </button>
      </div>
      <p className="settings-page__desc">
        配置 AI 模型连接（真实模式需要），各功能使用哪个模型，以及专利文献搜索 API。
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
        <button
          type="button"
          className={`settings-tab ${tab === "search" ? "settings-tab--active" : ""}`}
          onClick={() => setTab("search")}
          data-testid="tab-search"
        >
          专利搜索
        </button>
      </div>

      <div className="settings-content">
        {tab === "providers" && <ProvidersConfigPanel />}
        {tab === "agents" && <AgentsAssignmentPanel />}
        {tab === "search" && <SearchProvidersConfigPanel />}
      </div>
    </div>
  );
}
