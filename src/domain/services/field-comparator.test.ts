import { describe, expect, it } from "vitest";
import { compareField } from "./field-comparator";

describe("compareField", () => {
  it("matches identical strings exactly", () => {
    expect(compareField("Acme Corp", "Acme Corp", { type: "string" }, 0.01)).toBe(true);
  });

  it("does not match differing strings", () => {
    expect(compareField("Acme Corp", "Acme Co.", { type: "string" }, 0.01)).toBe(false);
  });

  it("matches numbers within the relative tolerance", () => {
    expect(compareField(100, 100.5, { type: "number" }, 0.01)).toBe(true);
  });

  it("does not match numbers outside the relative tolerance", () => {
    expect(compareField(100, 120, { type: "number" }, 0.01)).toBe(false);
  });

  it("matches numbers exactly at the tolerance boundary", () => {
    // |100 - 101| / max(100, 101) = 1/101 ~= 0.0099 <= 0.01
    expect(compareField(100, 101, { type: "number" }, 0.01)).toBe(true);
  });

  it("fails when one side is not a number for a numeric field", () => {
    expect(compareField(100, "100", { type: "number" }, 0.01)).toBe(false);
  });

  it("fails when either value is missing", () => {
    expect(compareField(undefined, 100, { type: "number" }, 0.01)).toBe(false);
    expect(compareField(100, undefined, { type: "number" }, 0.01)).toBe(false);
  });

  it("treats booleans and enums as exact match", () => {
    expect(compareField(true, true, { type: "boolean" }, 0.01)).toBe(true);
    expect(compareField("EUR", "USD", { type: "string", enum: ["EUR", "USD"] }, 0.01)).toBe(false);
  });
});
