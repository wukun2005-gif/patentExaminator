import type { ImportedFile, ReexamRequiredFileType } from "../../lib/case-gate";
import { FILE_TYPE_LABELS } from "../../lib/case-gate";

interface ImportedFileRowProps {
  file: ImportedFile;
  onDelete: (fileId: string) => void;
  onReplace: (fileType: ReexamRequiredFileType) => void;
}

export function ImportedFileRow({ file, onDelete, onReplace }: ImportedFileRowProps) {
  return (
    <div className="imported-file-row" data-testid={`imported-file-${file.fileType}`}>
      <span className="imported-file-row__status">✓</span>
      <div className="imported-file-row__info">
        <span className="imported-file-row__type">
          {FILE_TYPE_LABELS[file.fileType] ?? file.fileType}
          {file.required && <span className="imported-file-row__badge">必传</span>}
          {!file.required && <span className="imported-file-row__badge imported-file-row__badge--optional">选填</span>}
        </span>
        <span className="imported-file-row__name">{file.fileName}</span>
      </div>
      <div className="imported-file-row__actions">
        <button
          type="button"
          className="btn-link"
          onClick={() => onReplace(file.fileType)}
          data-testid={`btn-replace-${file.fileType}`}
        >
          重新上传
        </button>
        <button
          type="button"
          className="btn-link btn-link--danger"
          onClick={() => onDelete(file.id)}
          data-testid={`btn-delete-${file.fileType}`}
        >
          删除
        </button>
      </div>
    </div>
  );
}