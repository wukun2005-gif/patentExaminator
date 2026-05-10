import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ShellPlaceholder } from "./components/ShellPlaceholder";
import { CaseBaselineForm } from "./features/case/CaseBaselineForm";
import { DocumentUploadPanel } from "./features/documents/DocumentUploadPanel";
import { ReferenceLibraryPanel } from "./features/references/ReferenceLibraryPanel";

function RootLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/cases/new" replace /> },
      { path: "cases/new", element: <ShellPlaceholder title="新建案件" /> },
      { path: "cases/:caseId/baseline", element: <CaseBaselineForm /> },
      { path: "cases/:caseId/documents", element: <DocumentUploadPanel /> },
      { path: "cases/:caseId/references", element: <ReferenceLibraryPanel /> },
      { path: "cases/:caseId/claim-chart", element: <ShellPlaceholder title="Claim Chart" /> },
      { path: "cases/:caseId/novelty", element: <ShellPlaceholder title="新颖性对照" /> },
      { path: "cases/:caseId/inventive", element: <ShellPlaceholder title="创造性分析" /> },
      { path: "cases/:caseId/defects", element: <ShellPlaceholder title="形式缺陷" /> },
      { path: "cases/:caseId/draft", element: <ShellPlaceholder title="素材草稿" /> },
      { path: "cases/:caseId/response", element: <ShellPlaceholder title="答复审查" /> },
      { path: "cases/:caseId/interpret", element: <ShellPlaceholder title="文档解读" /> },
      { path: "cases/:caseId/export", element: <ShellPlaceholder title="导出" /> },
      { path: "cases", element: <ShellPlaceholder title="案件历史" /> },
      { path: "settings", element: <ShellPlaceholder title="设置" /> }
    ]
  }
]);
