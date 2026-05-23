import { useState, useRef, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { ModeBanner } from "./ModeBanner";
import { ChatPanel } from "../features/chat/ChatPanel";

interface AppShellProps {
  children: ReactNode;
}

const CASE_NAV_ITEMS = [
  { path: "setup", label: "复审文件导入", icon: "📄" },
  { path: "interpret", label: "文档解读", icon: "🔍" },
  { path: "opinion-comparison", label: "审查意见对照", icon: "🧾" },
  { path: "references", label: "文献清单", icon: "📚" },
  { path: "claim-chart", label: "权利要求特征表", icon: "📊" },
  { path: "novelty", label: "新颖性复核", icon: "⚖️" },
  { path: "inventive", label: "创造性复核", icon: "💡" },
  { path: "defects", label: "缺陷复查", icon: "⚠️" },
  { path: "draft", label: "复审意见草稿", icon: "✏️" },
  { path: "summary", label: "审查意见简述", icon: "📝" },
  { path: "export", label: "导出", icon: "📤" }
];

const TOOLTIP_SHOW_DELAY_MS = 400;

function showGuide() {
  localStorage.removeItem("patent-examiner-onboarding-done");
  window.dispatchEvent(new Event("show-onboarding"));
}

export function AppShell({ children }: AppShellProps) {
  const { caseId } = useParams<{ caseId: string }>();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState<string | null>(null);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, []);

  const handleItemHover = useCallback((itemPath: string) => {
    setHoveredItem(itemPath);
    // Start delay timer for tooltip visibility
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }
    tooltipTimeoutRef.current = setTimeout(() => {
      setTooltipVisible(itemPath);
    }, TOOLTIP_SHOW_DELAY_MS);
  }, []);

  const handleItemLeave = useCallback(() => {
    setHoveredItem(null);
    setTooltipVisible(null);
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }
  }, []);

  return (
    <div className="app-shell">
      <header className="app-shell__topbar">
        <Link to="/cases" className="app-shell__logo">专利复审 AI 助手</Link>
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
          style={{ position: 'relative' }}
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
                    onMouseEnter={() => handleItemHover(item.path)}
                    onMouseLeave={handleItemLeave}
                  >
                    <span className="sidebar-nav__icon">
                      {item.icon}
                    </span>
                    {sidebarCollapsed && tooltipVisible === item.path && (
                      <div className="tooltip" style={{
                        position: 'absolute',
                        left: '60px',
                        top: '0',
                        background: '#333',
                        color: '#fff',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '14px',
                        whiteSpace: 'nowrap',
                        zIndex: 1000,
                        pointerEvents: 'none',
                        transition: 'opacity 0.2s ease-in-out',
                        opacity: 1
                      }}>
                        {item.label}
                      </div>
                    )}
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