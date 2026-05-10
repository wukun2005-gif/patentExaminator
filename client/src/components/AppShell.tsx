import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ModeBanner } from "./ModeBanner";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="app-shell__topbar">
        <span className="app-shell__logo">专利审查助手</span>
        <ModeBanner />
        <nav className="app-shell__topnav">
          <Link to="/settings">设置</Link>
        </nav>
      </header>
      <div className="app-shell__body">
        <aside className="app-shell__sidebar" data-testid="sidebar">
          <nav className="sidebar-nav">
            <Link to="/cases/new">新建案件</Link>
            <Link to="/cases">案件历史</Link>
          </nav>
        </aside>
        <main className="app-shell__main" data-testid="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
