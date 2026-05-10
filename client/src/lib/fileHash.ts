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
