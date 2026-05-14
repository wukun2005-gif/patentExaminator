import type { AgentAssignment, ProviderId } from "@shared/types/agents";
import { useSettingsStore } from "../../store";
import { getModelMeta } from "../../lib/modelCatalog";

const AGENT_OPTIONS = [
  { id: "claim-chart", name: "权利要求拆解", desc: "将专利权利要求拆解为技术特征" },
  { id: "novelty", name: "新颖性分析", desc: "对比文献逐特征判断公开状态" },
  { id: "inventive", name: "创造性分析", desc: "三步法判断是否具有创造性" },
  { id: "defects", name: "形式缺陷检测", desc: "检测权利要求和说明书的形式问题" },
  { id: "extract-case-fields", name: "案件信息提取", desc: "从专利文档自动提取基本信息" },
  { id: "interpret", name: "文档解读", desc: "AI 交互式理解专利文档" },
  { id: "summary", name: "专利简述", desc: "生成专利申请简述" },
  { id: "draft", name: "审查素材", desc: "生成审查意见素材草稿" },
  { id: "chat", name: "通用对话", desc: "AI 问答" },
  { id: "search-references", name: "文献检索", desc: "AI 辅助检索对比文件" }
] as const;

const PROVIDER_NAMES: Record<ProviderId, string> = {
  gemini: "Gemini",
  mimo: "MiMo",
  kimi: "Kimi",
  glm: "GLM",
  minimax: "MiniMax",
  deepseek: "DeepSeek",
  qwen: "Qwen"
};

export function AgentsAssignmentPanel() {
  const { settings, setSettings } = useSettingsStore();

  const enabledProviders = settings.providers.filter((p) => p.enabled);

  const getAssignment = (agentId: string) =>
    settings.agents.find((a) => a.agent === agentId);

  const getDefaultModel = (providerId: ProviderId): string => {
    const provider = settings.providers.find((p) => p.providerId === providerId);
    return provider?.defaultModelId ?? (provider?.modelIds[0] ?? "");
  };

  const handleModelChange = (agentId: string, providerId: ProviderId, modelId: string) => {
    const existing = getAssignment(agentId);
    if (existing) {
      setSettings({
        ...settings,
        agents: settings.agents.map((a) =>
          a.agent === agentId ? { ...a, providerOrder: [providerId], modelId } : a
        )
      });
    } else {
      const newAgent: AgentAssignment = {
        agent: agentId as AgentAssignment["agent"],
        providerOrder: [providerId],
        modelId,
        maxTokens: 4096
      };
      setSettings({ ...settings, agents: [...settings.agents, newAgent] });
    }
  };

  const handleReset = (agentId: string) => {
    setSettings({ ...settings, agents: settings.agents.filter((a) => a.agent !== agentId) });
  };

  if (enabledProviders.length === 0) {
    return (
      <div className="agents-assignment-panel" data-testid="agents-assignment-panel">
        <p className="panel-desc">
          请先在「模型连接」标签页中启用至少一个服务商。
        </p>
      </div>
    );
  }

  const defaultProvider = enabledProviders[0];
  const defaultModel = defaultProvider ? getDefaultModel(defaultProvider.providerId) : "";

  return (
    <div className="agents-assignment-panel" data-testid="agents-assignment-panel">
      <p className="panel-desc">
        为每个 AI 功能选择使用哪个模型。未单独配置的功能将使用默认模型：
        <strong>{defaultProvider ? `${PROVIDER_NAMES[defaultProvider.providerId]} / ${defaultModel}` : "未设置"}</strong>。
      </p>

      <div className="agent-table">
        <div className="agent-table__header">
          <span>功能</span>
          <span>说明</span>
          <span>使用模型</span>
          <span />
        </div>
        {AGENT_OPTIONS.map((agentOpt) => {
          const assignment = getAssignment(agentOpt.id);
          const currentProvider = assignment?.providerOrder[0] ?? enabledProviders[0]?.providerId;
          const currentModel = assignment?.modelId ?? "";

          return (
            <div
              key={agentOpt.id}
              className="agent-table__row"
              data-testid={`agent-${agentOpt.id}`}
            >
              <span className="agent-table__name">{agentOpt.name}</span>
              <span className="agent-table__desc">{agentOpt.desc}</span>
              <span>
                <select
                  value={currentProvider && currentModel ? `${currentProvider}:${currentModel}` : ""}
                  onChange={(e) => {
                    const [pid, mid] = e.target.value.split(":");
                    if (pid && mid) handleModelChange(agentOpt.id, pid as ProviderId, mid);
                  }}
                  data-testid={`select-model-${agentOpt.id}`}
                >
                  {!assignment && <option value="">使用默认</option>}
                  {enabledProviders.map((p) => {
                    const defaultModel = getDefaultModel(p.providerId);
                    const models = p.modelIds;
                    return models.map((model) => {
                      const meta = getModelMeta(p.providerId, model);
                      const rec = meta?.recommendation ? ` [${meta.recommendation}]` : "";
                      return (
                        <option key={`${p.providerId}:${model}`} value={`${p.providerId}:${model}`}>
                          {PROVIDER_NAMES[p.providerId]} / {model}{rec}{model === defaultModel ? " (默认)" : ""}
                        </option>
                      );
                    });
                  })}
                </select>
              </span>
              <span>
                {assignment && (
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => handleReset(agentOpt.id)}
                    data-testid={`btn-reset-agent-${agentOpt.id}`}
                  >
                    重置
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
