import { describe, it, expect } from "vitest";
import { z } from "zod";

describe("Integration test infrastructure", () => {
  it("vitest integration config runs", () => {
    expect(typeof describe).toBe("function");
    expect(typeof it).toBe("function");
    expect(typeof expect).toBe("function");
  });

  it("zod schema validation works end-to-end", () => {
    const schema = z.object({
      ok: z.boolean(),
      data: z.string().optional(),
    });
    expect(schema.safeParse({ ok: true, data: "test" }).success).toBe(true);
    expect(schema.safeParse({ ok: false }).success).toBe(true);
    expect(schema.safeParse({ invalid: true }).success).toBe(false);
  });
});
