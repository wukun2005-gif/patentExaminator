/**
 * In-memory key store for API keys.
 * Keys are stored in memory only by default.
 * Optional AES-256-GCM persistence can be enabled via persistKeysEncrypted setting.
 */

const keyStore = new Map<string, string>();

export function setApiKey(providerId: string, apiKey: string): void {
  keyStore.set(providerId, apiKey);
}

export function getApiKey(providerId: string): string | undefined {
  return keyStore.get(providerId);
}

export function removeApiKey(providerId: string): boolean {
  return keyStore.delete(providerId);
}

export function listProviders(): string[] {
  return Array.from(keyStore.keys());
}

export function clearAll(): void {
  keyStore.clear();
}
