import type { ClaimChartResponse } from "../../agent/contracts";

// Import fixtures
import g1Led from "@shared/fixtures/g1-led.json";
import g2Battery from "@shared/fixtures/g2-battery.json";
import g3Sensor from "@shared/fixtures/g3-sensor.json";

const FIXTURES: Record<string, Record<string, ClaimChartResponse>> = {
  "claim-chart": {
    "g1-led": g1Led as unknown as ClaimChartResponse,
    "g2-battery": g2Battery as unknown as ClaimChartResponse,
    "g3-sensor": g3Sensor as unknown as ClaimChartResponse
  }
};

/**
 * Load a fixture response for the given agent type and case ID.
 * Falls back to G1 fixture if the specific case ID is not found.
 */
export function loadFixture(agentType: string, caseId: string): ClaimChartResponse {
  const agentFixtures = FIXTURES[agentType];
  if (!agentFixtures) {
    throw new Error(`No fixtures for agent type: ${agentType}`);
  }
  return agentFixtures[caseId] ?? agentFixtures["g1-led"]!;
}
