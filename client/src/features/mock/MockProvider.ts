import type {
  ClaimChartRequest,
  ClaimChartResponse,
  NoveltyRequest,
  NoveltyResponse,
  InventiveRequest,
  InventiveResponse
} from "../../agent/contracts";
import { loadFixture } from "./mockRouter";

export interface MockDelayOptions {
  mode: "random" | "fast" | "none";
}

/**
 * Mock AI provider that returns fixture data instead of calling real APIs.
 * Supports configurable delay simulation.
 */
export class MockProvider {
  private delayOptions: MockDelayOptions;

  constructor(delayOptions: MockDelayOptions = { mode: "random" }) {
    this.delayOptions = delayOptions;
  }

  async runClaimChart(request: ClaimChartRequest): Promise<ClaimChartResponse> {
    await this.simulateDelay();
    return loadFixture<ClaimChartResponse>("claim-chart", request.caseId);
  }

  async runNovelty(request: NoveltyRequest): Promise<NoveltyResponse> {
    await this.simulateDelay();
    return loadFixture<NoveltyResponse>("novelty", `${request.caseId}:${request.referenceId}`);
  }

  async runInventive(request: InventiveRequest): Promise<InventiveResponse> {
    await this.simulateDelay();
    return loadFixture<InventiveResponse>("inventive", request.caseId);
  }

  async runInterpret(caseId: string): Promise<string> {
    await this.simulateDelay();
    const fixture = loadFixture<{ response: string }>("interpret", caseId);
    return fixture.response;
  }

  private async simulateDelay(): Promise<void> {
    let ms: number;
    switch (this.delayOptions.mode) {
      case "fast":
        ms = 200;
        break;
      case "none":
        ms = 0;
        break;
      case "random":
      default:
        ms = 800 + Math.random() * 1200; // 800-2000ms
        break;
    }
    if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
