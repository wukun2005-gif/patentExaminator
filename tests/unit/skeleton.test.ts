import { describe, it, expect } from "vitest";
import { z } from "zod";

describe("Project skeleton", () => {
  it("vitest is configured and runs", () => {
    expect(typeof describe).toBe("function");
    expect(typeof it).toBe("function");
    expect(typeof expect).toBe("function");
  });

  it("zod is available for schema validation", () => {
    const schema = z.string().min(1);
    expect(schema.safeParse("").success).toBe(false);
    expect(schema.safeParse("hello").success).toBe(true);
  });

  it("zod object schema works", () => {
    const schema = z.object({
      name: z.string(),
      count: z.number().default(0),
    });
    const result = schema.safeParse({ name: "test" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.count).toBe(0);
    }
  });
});
