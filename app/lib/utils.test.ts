import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { daysSince, formatRelativeTime, plural } from "./utils";

describe("plural", () => {
  it("uses the singular noun for exactly one", () => {
    expect(plural(1, "lesson", "lessons")).toBe("1 lesson");
  });

  it("uses the plural noun for zero and for more than one", () => {
    expect(plural(0, "lesson", "lessons")).toBe("0 lessons");
    expect(plural(2, "lesson", "lessons")).toBe("2 lessons");
  });
});

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-02-18T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("says just now under a minute", () => {
    expect(formatRelativeTime("2027-02-18T11:59:30Z")).toBe("just now");
  });

  it("counts minutes, hours and days", () => {
    expect(formatRelativeTime("2027-02-18T11:55:00Z")).toBe("5m ago");
    expect(formatRelativeTime("2027-02-18T09:00:00Z")).toBe("3h ago");
    expect(formatRelativeTime("2027-02-16T12:00:00Z")).toBe("2d ago");
  });

  it("returns an empty string for a date it cannot read", () => {
    expect(formatRelativeTime("not a date")).toBe("");
  });
});

describe("daysSince", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-02-18T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clamps a future date to zero", () => {
    expect(daysSince("2027-03-01T00:00:00Z")).toBe(0);
  });

  it("counts whole days", () => {
    expect(daysSince("2027-02-15T11:00:00Z")).toBe(3);
  });
});
