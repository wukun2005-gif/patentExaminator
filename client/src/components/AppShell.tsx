import type { ReactNode } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { ModeBanner } from "./ModeBanner";

interface AppShellProps {
  children: ReactNode;
}

const CASE_NAV_ITEMS = [
  { path: "baseline", label: "案件基线" },
  { path: "documents", label: "文档导入" },
  { path: "references", label: "文献清单" },
  { path: "interpret", label: "文档解读" },
  { path: "claim-chart", label: "Claim Chart" },
  { path: "novelty", label: "新颖性对照" },
  { path: "inventive", label: "创造性分析" },
  { path: "defects", label: "形式缺陷" },
  { path: "draft", label: "素材草稿" },
  { path: "export", label: "导出" }
];

export function AppShell({ children }: AppShellProps) {
  const { caseId } = useParams<{ caseId: string }>();
  const location = useLocation();

  return (
    <div className="app-shell">
      <header className="app-shell__topbar">
        <Link to="/cases" className="app-shell__logo">专利审查助手</Link>
        <ModeBanner />
        <nav className="app-shell__topnav">
          <Link to="/settings">设置</Link>
        </nav>
      </header>
      <div className="app-shell__body">
        <aside className="app-shell__sidebar" data-testid="sidebar">
          <nav className="sidebar-nav">
            <div className="sidebar-section">
              <Link
                to="/cases/new"
                className={location.pathname === "/cases/new" ? "active" : ""}
              >
                新建案件
              </Link>
              <Link
                to="/cases"
                className={location.pathname === "/cases" ? "active" : ""}
              >
                案件历史
              </Link>
              <Link
                to="/settings"
                className={location.pathname === "/settings" ? "active" : ""}
              >
                设置
              </Link>
            </div>

            {caseId && (
              <div className="sidebar-section">
                <div className="sidebar-section__title">当前案件</div>
                {CASE_NAV_ITEMS.map((item) => (
                  <Link
                    key={item.path}
                    to={`/cases/${caseId}/${item.path}`}
                    className={
                      location.pathname === `/cases/${caseId}/${item.path}` ? "active" : ""
                    }
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </nav>
        </aside>
        <main className="app-shell__main" data-testid="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
