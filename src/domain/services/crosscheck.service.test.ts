import { describe, expect, it } from "vitest";
import { CrosscheckService } from "./crosscheck.service";

const schema = {
  type: "object",
  properties: {
    merchant: { type: "string" },
    total: { type: "number" },
  },
};

describe("CrosscheckService", () => {
  const service = new CrosscheckService();

  it("passes when 2 models agree on every field (first-wins merge)", () => {
    const output = service.compare({
      results: [
        { modelId: "azure-gpt-4o", data: { merchant: "Acme", total: 100 } },
        { modelId: "gemini-1.5-pro", data: { merchant: "Acme", total: 100.5 } },
      ],
      schema,
      threshold: 0.9,
      numericTolerance: 0.01,
    });

    expect(output.passed).toBe(true);
    expect(output.matchRatio).toBe(1);
    expect(output.mismatches).toEqual([]);
    expect(output.merged).toEqual({ merchant: "Acme", total: 100 });
  });

  it("fails and reports mismatches when 2 models disagree, without inventing a winner", () => {
    const output = service.compare({
      results: [
        { modelId: "azure-gpt-4o", data: { merchant: "Acme Corp", total: 100 } },
        { modelId: "gemini-1.5-pro", data: { merchant: "Acme Co.", total: 250 } },
      ],
      schema,
      threshold: 0.9,
      numericTolerance: 0.01,
    });

    expect(output.passed).toBe(false);
    expect(output.merged).toBeUndefined();
    expect(output.mismatches).toHaveLength(2);
    expect(output.mismatches.map((m) => m.field).sort()).toEqual(["merchant", "total"]);
    expect(output.mismatches[0]!.values).toEqual(
      expect.objectContaining({ "azure-gpt-4o": expect.anything(), "gemini-1.5-pro": expect.anything() }),
    );
  });

  it("merges by majority when 3+ models agree on a value", () => {
    const output = service.compare({
      results: [
        { modelId: "m1", data: { merchant: "Acme", total: 100 } },
        { modelId: "m2", data: { merchant: "Acme", total: 100 } },
        { modelId: "m3", data: { merchant: "Acme", total: 999 } },
      ],
      schema,
      threshold: 0.5,
      numericTolerance: 0.01,
    });

    expect(output.passed).toBe(true);
    expect(output.merged).toEqual({ merchant: "Acme", total: 100 });
  });

  it("flags missing_field when a field is absent from one model's output", () => {
    const output = service.compare({
      results: [
        { modelId: "azure-gpt-4o", data: { merchant: "Acme", total: 100 } },
        { modelId: "gemini-1.5-pro", data: { merchant: "Acme" } },
      ],
      schema,
      threshold: 0.9,
      numericTolerance: 0.01,
    });

    expect(output.passed).toBe(false);
    const totalMismatch = output.mismatches.find((m) => m.field === "total");
    expect(totalMismatch?.kind).toBe("missing_field");
  });

  it("treats a field missing from every model as agreement, not a mismatch", () => {
    const output = service.compare({
      results: [
        { modelId: "azure-gpt-4o", data: { merchant: "Acme" } },
        { modelId: "gemini-1.5-pro", data: { merchant: "Acme" } },
      ],
      schema,
      threshold: 0.9,
      numericTolerance: 0.01,
    });

    expect(output.passed).toBe(true);
    expect(output.matchRatio).toBe(1);
    expect(output.mismatches).toEqual([]);
    expect(output.merged?.merchant).toBe("Acme");
    expect(output.merged?.total).toBeUndefined();
  });

  it("merges using the value from whichever model actually returned it, not the first model in order", () => {
    const output = service.compare({
      results: [
        { modelId: "azure-gpt-4o", data: { merchant: "Acme" } },
        { modelId: "gemini-1.5-pro", data: { merchant: "Acme", total: 100 } },
      ],
      schema,
      // Threshold tolerates the one missing-field mismatch (1 of 2 fields match).
      threshold: 0.5,
      numericTolerance: 0.01,
    });

    expect(output.passed).toBe(true);
    expect(output.merged?.total).toBe(100);
  });

  it("respects the configured threshold as a boundary", () => {
    // 1 of 2 fields match -> matchRatio 0.5
    const output = service.compare({
      results: [
        { modelId: "azure-gpt-4o", data: { merchant: "Acme", total: 100 } },
        { modelId: "gemini-1.5-pro", data: { merchant: "Different", total: 100 } },
      ],
      schema,
      threshold: 0.5,
      numericTolerance: 0.01,
    });

    expect(output.matchRatio).toBe(0.5);
    expect(output.passed).toBe(true);
  });
});
