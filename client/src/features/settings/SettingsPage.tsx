import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ProvidersConfigPanel } from "./ProvidersConfigPanel";
import { AgentsAssignmentPanel } from "./AgentsAssignmentPanel";
import { SearchProvidersConfigPanel } from "./SearchProvidersConfigPanel";
import { KnowledgeConfigPanel } from "./KnowledgeConfigPanel";

type Tab = "providers" | "agents" | "search" | "knowledge";

const TAB_KEY = "patent-examiner-settings-tab";

export function SettingsPage() {
  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab") as Tab | null;

  const [tab, setTab] = useState<Tab>(() => {
    if (tabFromUrl && ["providers", "agents", "search", "knowledge"].includes(tabFromUrl)) return tabFromUrl;
    const saved = localStorage.getItem(TAB_KEY);
    return (saved as Tab) ?? "providers";
  });
  const navigate = useNavigate();

  const handleTabChange = (newTab: Tab) => {
    setTab(newTab);
    localStorage.setItem(TAB_KEY, newTab);
  };

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
          onClick={() => handleTabChange("providers")}
          data-testid="tab-providers"
        >
          模型连接
        </button>
        <button
          type="button"
          className={`settings-tab ${tab === "agents" ? "settings-tab--active" : ""}`}
          onClick={() => handleTabChange("agents")}
          data-testid="tab-agents"
        >
          功能分配
        </button>
        <button
          type="button"
          className={`settings-tab ${tab === "search" ? "settings-tab--active" : ""}`}
          onClick={() => handleTabChange("search")}
          data-testid="tab-search"
        >
          搜索
        </button>
        <button
          type="button"
          className={`settings-tab ${tab === "knowledge" ? "settings-tab--active" : ""}`}
          onClick={() => handleTabChange("knowledge")}
          data-testid="tab-knowledge"
        >
          知识库
        </button>
      </div>

      <div className="settings-content">
        {tab === "providers" && <ProvidersConfigPanel />}
        {tab === "agents" && <AgentsAssignmentPanel />}
        {tab === "search" && <SearchProvidersConfigPanel />}
        {tab === "knowledge" && <KnowledgeConfigPanel />}
      </div>
    </div>
  );
}
