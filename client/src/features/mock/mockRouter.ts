import type { ClaimChartResponse, NoveltyResponse } from "../../agent/contracts";

// Import fixtures
import g1Led from "@shared/fixtures/g1-led.json";
import g2Battery from "@shared/fixtures/g2-battery.json";
import g3Sensor from "@shared/fixtures/g3-sensor.json";
import noveltyG1D1 from "@shared/fixtures/novelty-g1-d1.json";

const FIXTURES: Record<string, Record<string, ClaimChartResponse | NoveltyResponse>> = {
  "claim-chart": {
    "g1-led": g1Led as unknown as ClaimChartResponse,
    "g2-battery": g2Battery as unknown as ClaimChartResponse,
    "g3-sensor": g3Sensor as unknown as ClaimChartResponse
  },
  novelty: {
    "g1-led:g1-ref-d1": noveltyG1D1 as unknown as NoveltyResponse
  }
};

/**
 * Load a fixture response for the given agent type and case ID.
 * Falls back to G1 fixture if the specific case ID is not found.
 */
export function loadFixture<T = ClaimChartResponse>(agentType: string, key: string): T {
  const agentFixtures = FIXTURES[agentType];
  if (!agentFixtures) {
    throw new Error(`No fixtures for agent type: ${agentType}`);
  }
  return (agentFixtures[key] ?? agentFixtures["g1-led"]!) as T;
}
