const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 500;
const SERVER_READY_KEY = "pex-server-ready";

let isServerReadyCache: boolean | null = null;

async function checkServerHealth(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    
    const response = await fetch(`${url}/health`, {
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
  // Return early if already confirmed ready (unless force check is requested)
  if (!forceCheck && isServerReadyCache === true) {
    return;
  }

  // Check localStorage cache (persists across page reloads in same session)
  if (!forceCheck) {
    const cached = localStorage.getItem(SERVER_READY_KEY);
    if (cached === "true") {
      isServerReadyCache = true;
      return;
    }
  }

  // Extract base URL for health check
  // The health endpoint is at /api/health when gatewayUrl is /api
  const healthUrl = gatewayUrl.includes("/api") ? `${gatewayUrl}/health` : "/health";
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const isReady = await checkServerHealth(healthUrl);
    
    if (isReady) {
      isServerReadyCache = true;
      localStorage.setItem(SERVER_READY_KEY, "true");
      console.info("[serverReady] Server ready, connection established");
      return;
    }
    
    if (attempt < MAX_RETRIES - 1) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  
  // If all retries failed, still proceed but clear the cache
  isServerReadyCache = false;
  localStorage.removeItem(SERVER_READY_KEY);
  console.warn("[serverReady] Server health check failed after max retries, proceeding anyway");
}

export function clearServerReadyCache(): void {
  isServerReadyCache = null;
  localStorage.removeItem(SERVER_READY_KEY);
}

export function markServerReady(): void {
  isServerReadyCache = true;
  localStorage.setItem(SERVER_READY_KEY, "true");
}