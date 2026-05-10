import { ProvidersConfigPanel } from "./ProvidersConfigPanel";
import { AgentsAssignmentPanel } from "./AgentsAssignmentPanel";

export function SettingsPage() {
  return (
    <div className="settings-page" data-testid="settings-page">
      <h2>设置</h2>
      <ProvidersConfigPanel />
      <AgentsAssignmentPanel />
    </div>
  );
}
