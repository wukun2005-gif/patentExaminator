import type { DocumentFigure } from "@shared/types/domain";

interface FigureViewerProps {
  figure: DocumentFigure;
  onClose: () => void;
}

export function FigureViewer({ figure, onClose }: FigureViewerProps) {
  return (
    <div className="figure-viewer-overlay" data-testid="figure-viewer-overlay" onClick={onClose}>
      <div className="figure-viewer" data-testid="figure-viewer" onClick={(e) => e.stopPropagation()}>
        <div className="figure-viewer__header">
          <h3>图{figure.figureNumber}: {figure.caption}</h3>
          <button
            type="button"
            className="figure-viewer__close"
            onClick={onClose}
            data-testid="figure-viewer-close"
          >
            ✕
          </button>
        </div>
        <div className="figure-viewer__image">
          <img
            src={figure.imageDataUrl}
            alt={`图${figure.figureNumber}: ${figure.caption}`}
            data-testid="figure-viewer-image"
          />
        </div>
        <div className="figure-viewer__meta">
          <span>页码: {figure.pageNumbers.join(", ")}</span>
          <span>尺寸: {figure.imageWidth}×{figure.imageHeight}px</span>
          <span>渲染方式: {figure.renderingMethod === "text-layer" ? "文本层" : "全页渲染"}</span>
        </div>
      </div>
    </div>
  );
}