/**
 * Sanitize file names for cross-platform compatibility.
 * - Replace illegal characters with underscore
 * - Truncate to max length
 * - Handle same-day conflicts with sequence number
 */

const ILLEGAL_CHARS = /[\/\\:*?"<>|]/g;
const MAX_TITLE_LENGTH = 40;

export function sanitizeFileName(name: string): string {
  return name
    .replace(ILLEGAL_CHARS, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function buildExportFileName(
  applicationNumber: string,
  title: string,
  type: string,
  date: string,
  sequenceNumber?: number
): string {
  const sanitizedNumber = sanitizeFileName(applicationNumber);
  const truncatedTitle = sanitizeFileName(title).slice(0, MAX_TITLE_LENGTH);
  const sanitizedType = sanitizeFileName(type);
  const sanitizedDate = sanitizeFileName(date);

  let fileName = `${sanitizedNumber}_${truncatedTitle}_${sanitizedType}_${sanitizedDate}`;

  if (sequenceNumber !== undefined && sequenceNumber > 0) {
    fileName += `_${sequenceNumber}`;
  }

  return fileName;
}
