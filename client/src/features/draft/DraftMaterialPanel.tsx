import { useCaseStore, useClaimsStore, useNoveltyStore, useInventiveStore, useDefectsStore } from "../../store";

interface DraftMaterialPanelProps {
  caseId: string;
}

const ASSESSMENT_LABELS: Record<string, string> = {
  "possibly-lacks-inventiveness": "可能缺乏创造性",
  "possibly-inventive": "可能具有创造性",
  "insufficient-evidence": "证据不足",
  "not-analyzed": "尚未分析"
};

const SEVERITY_LABELS: Record<string, string> = {
  error: "严重",
  warning: "警告",
  info: "提示"
};

export function DraftMaterialPanel({ caseId }: DraftMaterialPanelProps) {
  const { currentCase } = useCaseStore();
  const { claimFeatures } = useClaimsStore();
  const { comparisons } = useNoveltyStore();
  const { analyses } = useInventiveStore();
  const { defects } = useDefectsStore();

  const features = claimFeatures.filter((f) => f.caseId === caseId);
  const noveltyComparisons = comparisons.filter((c) => c.caseId === caseId);
  const claimNumber = currentCase?.targetClaimNumber ?? 1;
  const inventiveAnalysis = analyses.find(
    (a) => a.caseId === caseId && a.id === `inventive-${caseId}-${claimNumber}`
  );
  const caseDefects = defects.filter((d) => d.caseId === caseId);

  const confirmedFeatures = features.filter((f) => f.citationStatus !== "not-found");
  const diffCodes = [...new Set(noveltyComparisons.flatMap((c) => c.differenceFeatureCodes))];
  const pendingQuestions = [...new Set(noveltyComparisons.flatMap((c) => c.pendingSearchQuestions))];
  const unresolvedDefects = caseDefects.filter((d) => !d.resolved);

  return (
    <div className="draft-material-panel" data-testid="draft-material-panel">
      <h2>素材草稿</h2>
      <p className="draft-description">
        素材草稿由以下片段拼装，不做 AI 生成。
      </p>

      <div className="draft-sections">
        {/* Section 1: 正文草稿 */}
        <section className="draft-section" data-testid="section-body-draft">
          <h3>正文草稿</h3>
          <div className="section-content">
            {currentCase && (
              <div className="draft-case-summary">
                <p><strong>{currentCase.title}</strong>（{currentCase.applicationNumber}）</p>
              </div>
            )}
            {confirmedFeatures.length > 0 && (
              <div className="draft-features">
                <h4>Claim Chart（{confirmedFeatures.length} 个已确认特征）</h4>
                <ul>
                  {confirmedFeatures.map((f) => (
                    <li key={f.id}>{f.featureCode}: {f.description}</li>
                  ))}
                </ul>
              </div>
            )}
            {noveltyComparisons.length > 0 && (
              <div className="draft-novelty">
                <h4>新颖性对照（{noveltyComparisons.length} 篇对比文件）</h4>
                {noveltyComparisons.map((comp) => (
                  <div key={comp.id}>
                    <p>对比文件: {comp.referenceId} — 状态: {comp.status}</p>
                  </div>
                ))}
              </div>
            )}
            {confirmedFeatures.length === 0 && noveltyComparisons.length === 0 && (
              <p className="placeholder-hint">请先完成 Claim Chart 和新颖性分析。</p>
            )}
          </div>
        </section>

        {/* Section 2: 创造性分析 */}
        <section className="draft-section" data-testid="section-inventive">
          <h3>创造性三步法分析</h3>
          <div className="section-content">
            {inventiveAnalysis ? (
              <>
                <p><strong>最接近现有技术：</strong>{inventiveAnalysis.closestPriorArtId ?? "—"}</p>
                <p><strong>共有特征：</strong>{inventiveAnalysis.sharedFeatureCodes.join("、") || "无"}</p>
                <p><strong>区别特征：</strong>{inventiveAnalysis.distinguishingFeatureCodes.join("、") || "无"}</p>
                {inventiveAnalysis.objectiveTechnicalProblem && (
                  <p><strong>客观技术问题：</strong>{inventiveAnalysis.objectiveTechnicalProblem}</p>
                )}
                <p><strong>候选结论：</strong>{ASSESSMENT_LABELS[inventiveAnalysis.candidateAssessment]}</p>
                {inventiveAnalysis.motivationEvidence.length > 0 && (
                  <>
                    <h4>技术启示</h4>
                    <ul>
                      {inventiveAnalysis.motivationEvidence.map((e, i) => (
                        <li key={i}>{e.label}{e.quote ? `：「${e.quote}」` : ""}（置信度：{e.confidence}）</li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="legal-caution-text"><em>{inventiveAnalysis.legalCaution}</em></p>
              </>
            ) : (
              <p className="placeholder-hint">尚未运行创造性分析。</p>
            )}
          </div>
        </section>

        {/* Section 3: 分析策略 */}
        <section className="draft-section" data-testid="section-analysis-strategy">
          <h3>分析策略</h3>
          <div className="section-content">
            {diffCodes.length > 0 && (
              <div>
                <h4>区别特征候选（{diffCodes.length} 个）</h4>
                <ul>
                  {diffCodes.map((code) => <li key={code}>{code}</li>)}
                </ul>
              </div>
            )}
            {pendingQuestions.length > 0 && (
              <div>
                <h4>待检索问题（{pendingQuestions.length} 条）</h4>
                <ul>
                  {pendingQuestions.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              </div>
            )}
            {diffCodes.length === 0 && pendingQuestions.length === 0 && (
              <p className="placeholder-hint">基于新颖性对照和创造性分析结果生成。</p>
            )}
          </div>
        </section>

        {/* Section 4: 形式缺陷 */}
        <section className="draft-section" data-testid="section-defects">
          <h3>形式缺陷检查</h3>
          <div className="section-content">
            {caseDefects.length > 0 ? (
              <>
                <p>共 {caseDefects.length} 项缺陷，{unresolvedDefects.length} 项未解决</p>
                <table className="draft-defect-table">
                  <thead>
                    <tr>
                      <th>严重度</th>
                      <th>分类</th>
                      <th>描述</th>
                      <th>位置</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {caseDefects.map((d) => (
                      <tr key={d.id} className={d.resolved ? "defect-row--resolved" : ""}>
                        <td>{SEVERITY_LABELS[d.severity]}</td>
                        <td>{d.category}</td>
                        <td>{d.description}</td>
                        <td>{d.location ?? "—"}</td>
                        <td>{d.resolved ? "已解决" : "未解决"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="placeholder-hint">尚未运行形式缺陷检查。</p>
            )}
          </div>
        </section>

        {/* Section 5: 待确认事项 */}
        <section className="draft-section" data-testid="section-pending-items">
          <h3>待确认事项</h3>
          <div className="section-content">
            <ul>
              {pendingQuestions.map((q, i) => <li key={`q-${i}`}>{q}</li>)}
              {inventiveAnalysis?.cautions.map((c, i) => <li key={`c-${i}`}>{c}</li>)}
              {unresolvedDefects.map((d) => <li key={d.id}>[{SEVERITY_LABELS[d.severity]}] {d.description}</li>)}
              {pendingQuestions.length === 0 && !inventiveAnalysis?.cautions.length && unresolvedDefects.length === 0 && (
                <li className="placeholder-hint">暂无待确认事项。</li>
              )}
            </ul>
          </div>
        </section>
      </div>

      <p className="case-ref">案件 ID: {caseId}</p>
    </div>
  );
}
