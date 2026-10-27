import { describe, expect, it } from "vitest";
import { cleanGenerated } from "./clean-text";

describe("cleanGenerated", () => {
  it("removes raw bold markers", () => {
    expect(cleanGenerated("Apply **now** today")).toBe("Apply now today");
  });
  it("replaces sentence em dashes", () => {
    expect(cleanGenerated("Registration is open — apply soon")).not.toContain("—");
  });
  it("keeps numeric ranges as hyphen", () => {
    expect(cleanGenerated("Scene 0–3 seconds")).toBe("Scene 0-3 seconds");
  });
  it("keeps dates and URLs intact", () => {
    expect(cleanGenerated("Closes 15 November 2026 at https://x.edu/a-b")).toBe("Closes 15 November 2026 at https://x.edu/a-b");
  });
});
