import { useState } from "react";
import type { DocumentFigure } from "@shared/types/domain";
import { FigureViewer } from "./FigureViewer";

interface FigureExtractPanelProps {
  figures: DocumentFigure[];
  onFigureClick?: (figure: DocumentFigure) => void;
}

export function FigureExtractPanel({ figures, onFigureClick }: FigureExtractPanelProps) {
  const [viewingFigure, setViewingFigure] = useState<DocumentFigure | null>(null);

  if (figures.length === 0) {
    return null;
  }

  const handleClick = (figure: DocumentFigure) => {
    setViewingFigure(figure);
    onFigureClick?.(figure);
  };

  return (
    <div className="figure-extract-panel" data-testid="figure-extract-panel">
      <h3>附图列表 ({figures.length})</h3>
      <div className="figure-thumbnail-list" data-testid="figure-thumbnail-list">
        {figures.map((figure) => (
          <div
            key={figure.id}
            className="figure-thumbnail"
            data-testid={`figure-thumb-${figure.figureNumber}`}
            onClick={() => handleClick(figure)}
          >
            <img
              src={figure.imageDataUrl}
              alt={`图${figure.figureNumber}: ${figure.caption}`}
              className="figure-thumbnail__img"
            />
            <span className="figure-thumbnail__label">
              图{figure.figureNumber}
            </span>
            {figure.caption && (
              <span className="figure-thumbnail__caption">{figure.caption}</span>
            )}
          </div>
        ))}
      </div>

      {viewingFigure && (
        <FigureViewer
          figure={viewingFigure}
          onClose={() => setViewingFigure(null)}
        />
      )}
    </div>
  );
}