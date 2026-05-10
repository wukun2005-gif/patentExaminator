import { useState } from "react";
import type { OcrQualityResult } from "../../lib/ocrQuality";

interface OcrReviewPanelProps {
  quality: OcrQualityResult;
  ocrText: string;
  onConfirm: (text: string) => void;
  onManualPaste: (text: string) => void;
}

const LEVEL_LABELS = {
  good: { label: "良好", color: "#2e7d32", bg: "#e8f5e9" },
  poor: { label: "一般", color: "#f57f17", bg: "#fff8e1" },
  bad: { label: "较差", color: "#c62828", bg: "#ffebee" }
};

export function OcrReviewPanel({
  quality,
  ocrText,
  onConfirm,
  onManualPaste
}: OcrReviewPanelProps) {
  const [manualText, setManualText] = useState("");
  const [showManual, setShowManual] = useState(false);
  const levelInfo = LEVEL_LABELS[quality.level];

  return (
    <div className="ocr-review-panel" data-testid="ocr-review">
      <div className="ocr-quality-badge" data-testid={`ocr-quality-${quality.level}`}>
        <span
          style={{
            display: "inline-block",
            padding: "4px 12px",
            borderRadius: "4px",
            fontSize: "13px",
            fontWeight: 500,
            background: levelInfo.bg,
            color: levelInfo.color,
            border: `1px solid ${levelInfo.color}`
          }}
        >
          识别质量: {levelInfo.label} ({Math.round(quality.score * 100)}%)
        </span>
      </div>

      {quality.level === "bad" && (
        <p className="ocr-warning" data-testid="ocr-warning">
          识别质量较差，建议提供含文字层的 PDF 文件。
        </p>
      )}

      <div className="ocr-text-preview">
        <h4>识别结果预览</h4>
        <pre data-testid="ocr-text-preview">{ocrText.slice(0, 500)}{ocrText.length > 500 ? "..." : ""}</pre>
      </div>

      <div className="ocr-actions">
        <button
          type="button"
          onClick={() => onConfirm(ocrText)}
          data-testid="btn-confirm-ocr"
        >
          确认使用
        </button>
        <button
          type="button"
          onClick={() => setShowManual(!showManual)}
          data-testid="btn-manual-paste"
        >
          手动粘贴
        </button>
      </div>

      {showManual && (
        <div className="ocr-manual-input">
          <textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="请粘贴文字内容..."
            rows={8}
            data-testid="input-manual-text"
          />
          <button
            type="button"
            onClick={() => onManualPaste(manualText)}
            disabled={!manualText.trim()}
            data-testid="btn-submit-manual"
          >
            提交
          </button>
        </div>
      )}
    </div>
  );
}
