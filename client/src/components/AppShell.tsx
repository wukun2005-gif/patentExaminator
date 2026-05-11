import { useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { ModeBanner } from "./ModeBanner";
import { ChatPanel } from "../features/chat/ChatPanel";

interface AppShellProps {
  children: ReactNode;
}

const CASE_NAV_ITEMS = [
  { path: "setup", label: "案件基本信息导入", icon: "📄" },
  { path: "references", label: "文献清单", icon: "📚" },
  { path: "interpret", label: "文档解读", icon: "🔍" },
  { path: "claim-chart", label: "Claim Chart", icon: "📊" },
  { path: "novelty", label: "新颖性对照", icon: "⚖️" },
  { path: "inventive", label: "创造性分析", icon: "💡" },
  { path: "defects", label: "形式缺陷", icon: "⚠️" },
  { path: "draft", label: "素材草稿", icon: "✏️" },
  { path: "export", label: "导出", icon: "📤" }
];

function showGuide() {
  localStorage.removeItem("patent-examiner-onboarding-done");
  window.dispatchEvent(new Event("show-onboarding"));
}

export function AppShell({ children }: AppShellProps) {
  const { caseId } = useParams<{ caseId: string }>();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="app-shell">
      <header className="app-shell__topbar">
        <Link to="/cases" className="app-shell__logo">专利审查助手</Link>
        {caseId && (
          <span className="app-shell__case-id" data-testid="topbar-case-id">
            案件: {caseId}
          </span>
        )}
        <ModeBanner />
        <nav className="app-shell__topnav">
          <button type="button" className="btn-link" onClick={showGuide}>
            引导
          </button>
          <Link to="/settings">设置</Link>
        </nav>
      </header>
      <div className="app-shell__body">
        <aside
          className={`app-shell__sidebar${sidebarCollapsed ? " app-shell__sidebar--collapsed" : ""}`}
          data-testid="sidebar"
        >
          <button
            type="button"
            className="sidebar__toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
            data-testid="sidebar-toggle"
          >
            {sidebarCollapsed ? "›" : "‹"}
          </button>
          <nav className="sidebar-nav">
            <div className="sidebar-section">
              <Link
                to="/cases/new"
                className={location.pathname === "/cases/new" ? "active" : ""}
                title="新建案件"
              >
                <span className="sidebar-nav__icon">＋</span>
                {!sidebarCollapsed && "新建案件"}
              </Link>
              <Link
                to="/cases"
                className={location.pathname === "/cases" ? "active" : ""}
                title="案件历史"
              >
                <span className="sidebar-nav__icon">📋</span>
                {!sidebarCollapsed && "案件历史"}
              </Link>
            </div>

            {caseId && (
              <div className="sidebar-section">
                {!sidebarCollapsed && <div className="sidebar-section__title">当前案件</div>}
                {CASE_NAV_ITEMS.map((item) => (
                  <Link
                    key={item.path}
                    to={`/cases/${caseId}/${item.path}`}
                    className={
                      location.pathname === `/cases/${caseId}/${item.path}` ? "active" : ""
                    }
                    title={item.label}
                  >
                      <span className="sidebar-nav__icon">{item.icon}</span>
                    {!sidebarCollapsed && item.label}
                  </Link>
                ))}
              </div>
            )}
          </nav>
        </aside>
        <main className="app-shell__main" data-testid="main-content">
          {children}
        </main>
        {caseId && <ChatPanel />}
      </div>
    </div>
  );
}
