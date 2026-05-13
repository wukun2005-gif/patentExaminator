import { useState, useEffect, useRef } from "react";

interface InterpretPanelProps {
  caseId: string;
  documentText?: string;
  runInterpret: (prompt: string) => Promise<string>;
}

export function InterpretPanel({ caseId: _caseId, documentText, runInterpret }: InterpretPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [summarySaved, setSummarySaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoTriggered = useRef(false);

  useEffect(() => {
    if (documentText && !summary && !isLoading && !autoTriggered.current) {
      autoTriggered.current = true;
      doInterpret();
    }
  }, [documentText]);

  const doInterpret = async () => {
    if (!documentText || isLoading) return;

    setIsLoading(true);
    setSummarySaved(false);
    setError(null);
    try {
      const response = await runInterpret(documentText);
      setSummary(response);
    } catch (err) {
      setError(`解读失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSummary = () => {
    setSummarySaved(true);
    setTimeout(() => setSummarySaved(false), 2000);
  };

  return (
    <div className="interpret-panel" data-testid="interpret-panel">
      <h2>文档解读</h2>

      {!documentText ? (
        <p data-testid="no-document">请先上传专利文档。</p>
      ) : (
        <div className="interpret-main">
          <div className="interpret-main__header">
            <h3>解读结果</h3>
            <span className="interpret-main__hint">可直接编辑内容 · 如需追问请使用右侧 AI 助手</span>
          </div>
          <textarea
            className="interpret-summary"
            value={summary}
            onChange={(e) => { setSummary(e.target.value); setSummarySaved(false); }}
            placeholder={isLoading ? "AI 解读中…" : "AI 解读结果将显示在此处。"}
            data-testid="interpret-summary"
            readOnly={isLoading}
          />
          {error && <p className="extract-error" data-testid="interpret-error" style={{ color: "#c00", fontSize: "0.9em", margin: "4px 0" }}>{error}</p>}
          <div className="interpret-main__actions">
            <button
              type="button"
              onClick={doInterpret}
              disabled={!documentText || isLoading}
              data-testid="btn-reinterpret"
            >
              {isLoading ? "解读中…" : "重新解读"}
            </button>
            <button
              type="button"
              onClick={handleSaveSummary}
              disabled={!summary}
              data-testid="btn-save-summary"
            >
              {summarySaved ? "已保存" : "保存解读"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
