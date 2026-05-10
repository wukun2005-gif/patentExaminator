import { describe, it, expect } from "vitest";
import { MockProvider } from "@client/features/mock/MockProvider";

describe("Interpret module", () => {
  it("InterpretPanel can be imported", async () => {
    const mod = await import("@client/features/interpret/InterpretPanel");
    expect(mod.InterpretPanel).toBeDefined();
    expect(typeof mod.InterpretPanel).toBe("function");
  });

  it("MockProvider.runInterpret returns response for G1", async () => {
    const provider = new MockProvider({ mode: "none" });
    const result = await provider.runInterpret("g1-led");
    expect(result).toContain("LED散热");
    expect(result).toContain("技术方案");
    expect(result).toContain("技术效果");
  });

  it("interpret fixture contains key sections", async () => {
    const fixture = await import("@shared/fixtures/interpret-g1.json");
    expect(fixture.response).toContain("技术领域");
    expect(fixture.response).toContain("技术方案");
    expect(fixture.response).toContain("技术效果");
    expect(fixture.response).toContain("关键特征");
  });
});
