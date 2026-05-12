import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FIXTURE_MAP: Record<string, Record<string, string>> = {
  "claim-chart": {
    "g1-led": "g1-led.json",
    "g2-battery": "g2-battery.json",
    "g3-sensor": "g3-sensor.json",
  },
  novelty: {
    "g1-led:g1-ref-d1": "novelty-g1-d1.json",
  },
  inventive: {
    "g2-battery": "inventive-g2.json",
  },
  interpret: {
    "g1-led": "interpret-g1.json",
  },
};

const FIXTURE_CACHE = new Map<string, unknown>();

export function loadFixture(agentType: string, key: string): unknown {
  const agentFixtures = FIXTURE_MAP[agentType];
  if (!agentFixtures) {
    throw new Error(`No fixtures for agent type: ${agentType}`);
  }

  // Try exact match first, then fall back to g1-led
  const fileName = agentFixtures[key] ?? Object.values(agentFixtures)[0];
  if (!fileName) {
    throw new Error(`No fixture for agent=${agentType} key=${key}`);
  }

  if (FIXTURE_CACHE.has(fileName)) {
    return FIXTURE_CACHE.get(fileName);
  }

  const filePath = path.join(__dirname, fileName);
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  FIXTURE_CACHE.set(fileName, parsed);
  return parsed;
}
