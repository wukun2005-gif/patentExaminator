import type { OcrProgress } from "../../lib/ocrWorker";

interface OcrProgressPanelProps {
  progress: OcrProgress | null;
  fileName: string;
}

export function OcrProgressPanel({ progress, fileName }: OcrProgressPanelProps) {
  if (!progress) return null;

  const percent = Math.round(progress.progress * 100);

  return (
    <div className="ocr-progress-panel" data-testid="ocr-progress">
      <p>正在识别: {fileName}</p>
      <div className="ocr-progress-bar">
        <div
          className="ocr-progress-bar__fill"
          style={{ width: `${percent}%` }}
          data-testid="ocr-progress-bar"
        />
      </div>
      <p className="ocr-progress-status" data-testid="ocr-progress-status">
        {progress.status} ({percent}%)
      </p>
    </div>
  );
}
