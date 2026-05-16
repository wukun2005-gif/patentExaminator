export type ReexamRequiredFileType =
  | "reexam-request"
  | "rejection-decision"
  | "original-application"
  | "comparison-document";

export interface ImportedFile {
  id: string;
  fileName: string;
  fileType: ReexamRequiredFileType;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  required: boolean;
}

export type ImportGateStatus = "incomplete" | "warning" | "ready";

export const REQUIRED_REEXAM_FILE_TYPES: ReexamRequiredFileType[] = [
  "reexam-request",
  "rejection-decision",
  "original-application",
];

export const OPTIONAL_REEXAM_FILE_TYPES: ReexamRequiredFileType[] = [
  "comparison-document",
];

export const FILE_TYPE_LABELS: Record<ReexamRequiredFileType, string> = {
  "reexam-request": "复审请求书",
  "rejection-decision": "驳回决定书",
  "original-application": "原始申请文件",
  "comparison-document": "对比文件",
};

export const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/png",
  "image/jpeg",
];

export const MAX_FILE_SIZE = 50 * 1024 * 1024;

export function checkImportGate(files: ImportedFile[]): ImportGateStatus {
  const hasAllRequired = REQUIRED_REEXAM_FILE_TYPES.every((type) =>
    files.some((f) => f.fileType === type)
  );

  if (!hasAllRequired) return "incomplete";

  const hasOptional = OPTIONAL_REEXAM_FILE_TYPES.some((type) =>
    files.some((f) => f.fileType === type)
  );

  if (!hasOptional) return "warning";

  return "ready";
}

export function getMissingRequiredFiles(files: ImportedFile[]): ReexamRequiredFileType[] {
  return REQUIRED_REEXAM_FILE_TYPES.filter(
    (type) => !files.some((f) => f.fileType === type)
  );
}

export function getMissingOptionalFiles(files: ImportedFile[]): ReexamRequiredFileType[] {
  return OPTIONAL_REEXAM_FILE_TYPES.filter(
    (type) => !files.some((f) => f.fileType === type)
  );
}