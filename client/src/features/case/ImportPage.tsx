import { useState, useCallback } from "react";
import type { ImportedFile, ReexamRequiredFileType, ImportGateStatus } from "../../lib/case-gate";
import {
  REQUIRED_REEXAM_FILE_TYPES,
  OPTIONAL_REEXAM_FILE_TYPES,
  FILE_TYPE_LABELS,
  SUPPORTED_MIME_TYPES,
  MAX_FILE_SIZE,
  checkImportGate,
  getMissingRequiredFiles,
  getMissingOptionalFiles,
} from "../../lib/case-gate";
import { ImportedFileRow } from "./ImportedFileRow";
import { DeleteFileDialog } from "./DeleteFileDialog";

interface ImportPageProps {
  caseId: string;
  importedFiles: ImportedFile[];
  onUploadFile: (fileType: ReexamRequiredFileType, file: File) => Promise<void>;
  onDeleteFile: (fileId: string) => Promise<void>;
  onStartReview: () => void;
}

export function ImportPage({ caseId: _caseId, importedFiles, onUploadFile, onDeleteFile, onStartReview }: ImportPageProps) {
  const [uploadingType, setUploadingType] = useState<ReexamRequiredFileType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<ImportedFile | null>(null);

  const gateStatus: ImportGateStatus = checkImportGate(importedFiles);
  const missingRequired = getMissingRequiredFiles(importedFiles);
  const missingOptional = getMissingOptionalFiles(importedFiles);
  const canStart = gateStatus !== "incomplete";

  const handleFileSelect = useCallback(
    async (fileType: ReexamRequiredFileType, file: File) => {
      setError(null);

      if (!SUPPORTED_MIME_TYPES.includes(file.type)) {
        setError(`不支持的文件格式: ${file.type}。支持格式: PDF、DOCX、TXT、PNG、JPEG`);
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        setError(`文件过大 (${(file.size / 1024 / 1024).toFixed(1)}MB)，最大支持 50MB`);
        return;
      }

      setUploadingType(fileType);
      try {
        await onUploadFile(fileType, file);
      } catch (err) {
        setError(`上传失败: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setUploadingType(null);
      }
    },
    [onUploadFile]
  );

  const handleDelete = useCallback(
    async (fileId: string) => {
      const file = importedFiles.find((f) => f.id === fileId);
      if (file) {
        setDeletingFile(file);
      }
    },
    [importedFiles]
  );

  const confirmDelete = useCallback(async () => {
    if (!deletingFile) return;
    try {
      await onDeleteFile(deletingFile.id);
    } catch (err) {
      setError(`删除失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeletingFile(null);
    }
  }, [deletingFile, onDeleteFile]);

  const allFileTypes: ReexamRequiredFileType[] = [...REQUIRED_REEXAM_FILE_TYPES, ...OPTIONAL_REEXAM_FILE_TYPES];

  return (
    <div className="import-page" data-testid="import-page">
      <h2>案件基本信息导入</h2>

      <div className="import-page__section">
        <h3>必传文件 ({importedFiles.filter((f) => f.required).length}/{REQUIRED_REEXAM_FILE_TYPES.length})</h3>

        {allFileTypes.map((fileType) => {
          const existingFile = importedFiles.find((f) => f.fileType === fileType);
          const isRequired = REQUIRED_REEXAM_FILE_TYPES.includes(fileType);
          const isUploading = uploadingType === fileType;

          if (existingFile) {
            return (
              <ImportedFileRow
                key={fileType}
                file={existingFile}
                onDelete={handleDelete}
                onReplace={(ft) => {
                  const input = document.getElementById(`file-input-${ft}`) as HTMLInputElement;
                  input?.click();
                }}
              />
            );
          }

          return (
            <div
              key={fileType}
              className={`imported-file-row imported-file-row--missing`}
              data-testid={`missing-file-${fileType}`}
            >
              <span className="imported-file-row__status">
                {isRequired ? "⚠" : "○"}
              </span>
              <div className="imported-file-row__info">
                <span className="imported-file-row__type">
                  {FILE_TYPE_LABELS[fileType] ?? fileType}
                  {isRequired && <span className="imported-file-row__badge">必传</span>}
                  {!isRequired && <span className="imported-file-row__badge imported-file-row__badge--optional">选填</span>}
                </span>
                <span className="imported-file-row__name imported-file-row__name--missing">
                  {isUploading ? "上传中…" : isRequired ? "未上传 — 必须上传" : "未上传（建议补充）"}
                </span>
              </div>
              <div className="imported-file-row__actions">
                <input
                  type="file"
                  id={`file-input-${fileType}`}
                  accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(fileType, file);
                    e.target.value = "";
                  }}
                  data-testid={`file-input-${fileType}`}
                />
                <button
                  type="button"
                  onClick={() => {
                    const input = document.getElementById(`file-input-${fileType}`) as HTMLInputElement;
                    input?.click();
                  }}
                  disabled={isUploading}
                  data-testid={`btn-upload-${fileType}`}
                >
                  {isUploading ? "上传中…" : "上传"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="import-page__error" data-testid="import-error" style={{ color: "#c00", fontSize: "0.9em", margin: "8px 0" }}>
          {error}
        </p>
      )}

      {gateStatus === "incomplete" && (
        <div className="import-page__gate-warning" data-testid="gate-warning">
          <p>⚠ 以下必传文件缺失，无法开始复审：</p>
          <ul>
            {missingRequired.map((type) => (
              <li key={type}>{FILE_TYPE_LABELS[type]}</li>
            ))}
          </ul>
        </div>
      )}

      {gateStatus === "warning" && (
        <div className="import-page__gate-warning import-page__gate-warning--optional" data-testid="gate-warning-optional">
          <p>建议补充以下选填文件以获得更完整的审查支持：</p>
          <ul>
            {missingOptional.map((type) => (
              <li key={type}>{FILE_TYPE_LABELS[type]}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        className="btn-primary"
        onClick={onStartReview}
        disabled={!canStart}
        data-testid="btn-start-review"
      >
        开始复审
      </button>

      {deletingFile && (
        <DeleteFileDialog
          fileName={deletingFile.fileName}
          onConfirm={confirmDelete}
          onCancel={() => setDeletingFile(null)}
        />
      )}
    </div>
  );
}