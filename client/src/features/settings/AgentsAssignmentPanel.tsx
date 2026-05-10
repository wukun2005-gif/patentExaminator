import type { AgentAssignment, ProviderId } from "@shared/types/agents";
import { useSettingsStore } from "../../store";

const AGENT_OPTIONS = [
  { id: "claim-chart", name: "Claim Chart 生成" },
  { id: "novelty", name: "新颖性对照" },
  { id: "inventive", name: "创造性分析" },
  { id: "summary", name: "简述生成" },
  { id: "draft", name: "素材草稿" },
  { id: "interpret", name: "文档解读" },
  { id: "chat", name: "AI 对话" }
] as const;

const MODEL_OPTIONS: Record<ProviderId, string[]> = {
  mimo: ["MiMo-V2.5-Pro", "MiMo-V2.5", "MiMo-V2-Pro", "MiMo-V2-Omni"],
  kimi: ["moonshot-v1-128k", "moonshot-v1-32k"],
  glm: ["glm-4-plus", "glm-4", "glm-4-long"],
  minimax: ["abab6.5s-chat", "abab6.5-chat"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"]
};

export function AgentsAssignmentPanel() {
  const { settings, setSettings } = useSettingsStore();

  const enabledProviders = settings.providers.filter((p) => p.enabled);
  const providerIds = enabledProviders.map((p) => p.providerId);

  const handleUpdateAgent = (agentId: string, updates: Partial<AgentAssignment>) => {
    const existing = settings.agents.find((a) => a.agent === agentId);
    if (existing) {
      setSettings({
        ...settings,
        agents: settings.agents.map((a) =>
          a.agent === agentId ? { ...a, ...updates } : a
        )
      });
    } else {
      const newAgent: AgentAssignment = {
        agent: agentId as AgentAssignment["agent"],
        providerOrder: providerIds.slice(0, 1),
        modelId: getDefaultModel(providerIds[0] ?? "mimo"),
        maxTokens: 4096,
        ...updates
      };
      setSettings({
        ...settings,
        agents: [...settings.agents, newAgent]
      });
    }
  };

  const handleRemoveAgent = (agentId: string) => {
    setSettings({
      ...settings,
      agents: settings.agents.filter((a) => a.agent !== agentId)
    });
  };

  return (
    <div className="agents-assignment-panel" data-testid="agents-assignment-panel">
      <h3>Agent 分配</h3>

      {enabledProviders.length === 0 ? (
        <p className="warning">请先在上方配置并启用至少一个 Provider。</p>
      ) : (
        <div className="agent-list">
          {AGENT_OPTIONS.map((agentOpt) => {
            const assignment = settings.agents.find((a) => a.agent === agentOpt.id);
            return (
              <div
                key={agentOpt.id}
                className="agent-item"
                data-testid={`agent-${agentOpt.id}`}
              >
                <div className="agent-header">
                  <span className="agent-name">{agentOpt.name}</span>
                  {assignment && (
                    <button
                      type="button"
                      onClick={() => handleRemoveAgent(agentOpt.id)}
                      data-testid={`btn-remove-agent-${agentOpt.id}`}
                      className="remove-btn"
                    >
                      重置
                    </button>
                  )}
                </div>

                <div className="agent-config">
                  <div className="config-row">
                    <label>Provider 顺序：</label>
                    <select
                      multiple
                      value={assignment?.providerOrder ?? []}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions, (o) => o.value) as ProviderId[];
                        handleUpdateAgent(agentOpt.id, { providerOrder: selected });
                      }}
                      data-testid={`select-providers-${agentOpt.id}`}
                    >
                      {enabledProviders.map((p) => (
                        <option key={p.providerId} value={p.providerId}>
                          {p.providerId}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="config-row">
                    <label>模型：</label>
                    <select
                      value={assignment?.modelId ?? ""}
                      onChange={(e) =>
                        handleUpdateAgent(agentOpt.id, { modelId: e.target.value })
                      }
                      data-testid={`select-model-${agentOpt.id}`}
                    >
                      {enabledProviders.flatMap((p) =>
                        (MODEL_OPTIONS[p.providerId] ?? []).map((model) => (
                          <option key={`${p.providerId}-${model}`} value={model}>
                            {p.providerId}: {model}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="config-row">
                    <label>Max Tokens：</label>
                    <input
                      type="number"
                      value={assignment?.maxTokens ?? 4096}
                      onChange={(e) =>
                        handleUpdateAgent(agentOpt.id, { maxTokens: Number(e.target.value) })
                      }
                      min={256}
                      max={32768}
                      data-testid={`input-max-tokens-${agentOpt.id}`}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getDefaultModel(providerId: ProviderId): string {
  const defaults: Record<ProviderId, string> = {
    mimo: "MiMo-V2.5-Pro",
    kimi: "moonshot-v1-128k",
    glm: "glm-4-plus",
    minimax: "abab6.5s-chat",
    deepseek: "deepseek-chat"
  };
  return defaults[providerId] ?? "";
}
