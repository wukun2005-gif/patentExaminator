/**
 * Compute SHA-256 hash of a file as a hex string.
 * Uses the Web Crypto API (available in all modern browsers and Node ≥ 15).
 */
export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a globally unique document ID.
 * Format: doc-<timestamp36>-<random6> — same pattern as candidate IDs.
 * No file hash dependency → no cross-case collision risk.
 */
export function generateDocId(): string {
  return `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
