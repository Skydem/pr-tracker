import { describe, it, expect } from "vitest";
import { describeActivity, clampLimit } from "../src/utils/activity.js";

describe("describeActivity", () => {
  it("credits the reviewer, not the author, for approvals", () => {
    expect(describeActivity("PR_APPROVED", "Tomasz", "Marek", false)).toBe(
      "Tomasz approved Marek's PR"
    );
  });

  it("credits the reviewer for changes requested", () => {
    expect(describeActivity("PR_CHANGES_REQUESTED", "Marek", "Tomasz", false)).toBe(
      "Marek requested changes on Tomasz's PR"
    );
  });

  it("names a fresh PR without an author possessive", () => {
    expect(describeActivity("PR_CREATED", "Daniel", "Daniel", true)).toBe(
      "Daniel opened a new PR"
    );
  });

  it("does not say a person approved someone else's PR when they authored it", () => {
    expect(describeActivity("PR_APPROVED", "Tomasz", "Tomasz", true)).toBe(
      "Tomasz approved their own PR"
    );
  });
});

describe("clampLimit", () => {
  it("falls back to the default for missing or invalid input", () => {
    expect(clampLimit(undefined)).toBe(10);
    expect(clampLimit("not-a-number")).toBe(10);
    expect(clampLimit("-5")).toBe(10);
  });

  it("parses a valid numeric string", () => {
    expect(clampLimit("25")).toBe(25);
  });

  it("caps at the max", () => {
    expect(clampLimit("500")).toBe(100);
  });
});
