import { useState, useEffect, useRef } from "react";
import { useInterpretStore } from "../../store";
import { detectLanguage, LANGUAGE_LABELS } from "../../lib/languageDetect";
import type { DocumentFigure } from "@shared/types/domain";
import { FigureExtractPanel } from "./FigureExtractPanel";

interface InterpretPanelProps {
  caseId: string;
  documentText?: string;
  figures?: DocumentFigure[];
  runInterpret: (prompt: string) => Promise<string>;
  runTranslate?: (text: string) => Promise<string>;
}

export function InterpretPanel({ caseId, documentText, figures, runInterpret, runTranslate }: InterpretPanelProps) {
  const { interpretSummaries, setInterpretSummary } = useInterpretStore();
  const persistedSummary = interpretSummaries[caseId] ?? "";
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState(persistedSummary);
  const [error, setError] = useState<string | null>(null);
  const autoTriggered = useRef(false);

  const [sourceLanguage, setSourceLanguage] = useState<"zh" | "en" | "other">("zh");
  const [translatedText, setTranslatedText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const translateTriggered = useRef(false);

  useEffect(() => {
    setSummary(persistedSummary);
    autoTriggered.current = false;
  }, [caseId]);

  useEffect(() => {
    if (documentText) {
      const lang = detectLanguage(documentText);
      setSourceLanguage(lang);
      if (lang !== "zh" && runTranslate && !translateTriggered.current) {
        translateTriggered.current = true;
        doTranslate();
      }
    }
  }, [documentText]);

  useEffect(() => {
    if (documentText && !persistedSummary && !isLoading && !autoTriggered.current) {
      autoTriggered.current = true;
      doInterpret();
    }
  }, [documentText, persistedSummary, translatedText]);

  useEffect(() => {
    if (summary && summary !== persistedSummary) {
      setInterpretSummary(caseId, summary);
    }
  }, [summary, caseId, setInterpretSummary, persistedSummary]);

  const doTranslate = async () => {
    if (!documentText || !runTranslate || isTranslating) return;

    setIsTranslating(true);
    setTranslateError(null);
    try {
      const result = await runTranslate(documentText);
      setTranslatedText(result);
    } catch (err) {
      setTranslateError(`翻译失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsTranslating(false);
    }
  };

  const doInterpret = async () => {
    if (!documentText || isLoading) return;

    const textToInterpret = sourceLanguage !== "zh" && translatedText ? translatedText : documentText;

    setIsLoading(true);
    setError(null);
    try {
      const response = await runInterpret(textToInterpret);
      setSummary(response);
      setInterpretSummary(caseId, response);
    } catch (err) {
      setError(`解读失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const needsTranslation = sourceLanguage !== "zh";

  return (
    <div className="interpret-panel" data-testid="interpret-panel">
      <h2>文档解读</h2>

      {!documentText ? (
        <p data-testid="no-document">请先上传专利文档。</p>
      ) : (
        <div className="interpret-main">
          {needsTranslation && (
            <div className="interpret-translation" data-testid="interpret-translation">
              <div className="interpret-translation__header">
                <h3>中文翻译</h3>
                <span className="interpret-translation__lang" data-testid="source-language">
                  源语言: {LANGUAGE_LABELS[sourceLanguage] ?? sourceLanguage}
                </span>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setShowOriginal(!showOriginal)}
                  data-testid="btn-toggle-original"
                >
                  {showOriginal ? "收起原文" : "查看原文"}
                </button>
              </div>

              {showOriginal && (
                <div className="interpret-translation__original" data-testid="original-text">
                  <pre>{documentText.slice(0, 5000)}{documentText.length > 5000 ? "\n…（原文过长，已截断）" : ""}</pre>
                </div>
              )}

              <textarea
                className="interpret-translation__textarea"
                value={translatedText}
                onChange={(e) => setTranslatedText(e.target.value)}
                placeholder={isTranslating ? "翻译中…" : "中文翻译结果将显示在此处。"}
                data-testid="translated-text"
                readOnly={isTranslating}
              />

              {translateError && (
                <p className="extract-error" data-testid="translate-error" style={{ color: "#c00", fontSize: "0.9em", margin: "4px 0" }}>
                  {translateError}
                </p>
              )}

              <button
                type="button"
                onClick={doTranslate}
                disabled={!documentText || isTranslating}
                data-testid="btn-retranslate"
              >
                {isTranslating ? "翻译中…" : "重新翻译"}
              </button>
            </div>
          )}

          {figures && figures.length > 0 && (
            <FigureExtractPanel figures={figures} />
          )}

          <div className="interpret-main__header">
            <h3>解读结果</h3>
            <span className="interpret-main__hint">可直接编辑内容 · 如需追问请使用右侧 AI 助手</span>
          </div>
          <textarea
            className="interpret-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder={isLoading ? "AI 解读中…" : "AI 解读结果将显示在此处。"}
            data-testid="interpret-summary"
            readOnly={isLoading}
          />
          {error && <p className="extract-error" data-testid="interpret-error" style={{ color: "#c00", fontSize: "0.9em", margin: "4px 0" }}>{error}</p>}
          <div className="interpret-main__actions">
            <span className="interpret-main__hint">内容自动保存</span>
            <button
              type="button"
              onClick={doInterpret}
              disabled={!documentText || isLoading}
              data-testid="btn-reinterpret"
            >
              {isLoading ? "解读中…" : "重新解读"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}