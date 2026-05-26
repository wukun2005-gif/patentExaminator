const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 500;

let isServerReadyCache: boolean | null = null;

async function checkServerHealth(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

export async function waitForServerReady(gatewayUrl: string = "/api", forceCheck = false): Promise<void> {
  if (!forceCheck && isServerReadyCache === true) {
    return;
  }

  const healthUrl = gatewayUrl.includes("/api") ? `${gatewayUrl}/health` : "/health";
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const isReady = await checkServerHealth(healthUrl);
    
    if (isReady) {
      isServerReadyCache = true;
      console.info("[serverReady] Server ready, connection established");
      return;
    }
    
    if (attempt < MAX_RETRIES - 1) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  
  isServerReadyCache = false;
  console.warn("[serverReady] Server health check failed after max retries, proceeding anyway");
}

export function clearServerReadyCache(): void {
  isServerReadyCache = null;
}

export function markServerReady(): void {
  isServerReadyCache = true;
}