import { describe, expect, it } from "vitest";
import { findUnsupportedValues, overallStatus, reconcileClaims } from "./verify";

const SRC =
  "Final-year undergraduate students can apply for the Innovation Showcase. Registration closes on 15 November 2026. Register using the student portal. There is no registration fee.";

describe("verification rules", () => {
  it("accepts the source deadline in a different format", () => {
    expect(findUnsupportedValues("Apply by November 15, 2026!", SRC)).toEqual([]);
  });
  it("flags a changed deadline", () => {
    expect(findUnsupportedValues("Registration closes 20 November 2026", SRC)).toEqual(["20 November 2026"]);
  });
  it("flags an invented scholarship amount", () => {
    expect(findUnsupportedValues("Winners get a ₹10,000 scholarship", SRC)).toEqual(["₹10,000"]);
  });
  it("downgrades a Supported claim whose quote is not in the source", () => {
    const r = reconcileClaims([{ claim: "x", status: "Supported", source_quote: "made up quote" }], "x", SRC);
    expect(r[0]?.status).toBe("Needs Review");
  });
  it("blocks approval when any contradiction exists", () => {
    expect(overallStatus([{ claim: "a", status: "Supported" }, { claim: "b", status: "Contradiction" }])).toBe("blocked");
  });
  it("never marks an output with no checked claims as verified", () => {
    expect(overallStatus([])).toBe("review");
  });
});
