import { describe, expect, it } from "vitest";
import {
  ALL_CATEGORIES,
  categoryChoice,
  parseCategoryParam,
} from "./category-filter";

describe("parseCategoryParam", () => {
  it("filters on the slug the dropdown sent", () => {
    expect(parseCategoryParam("design")).toBe("design");
  });

  it("filters on a category an admin named All", () => {
    expect(parseCategoryParam("all")).toBe("all");
  });

  it("reads the All Categories choice as no filter", () => {
    expect(parseCategoryParam(ALL_CATEGORIES)).toBeNull();
  });

  it("reads a missing or empty parameter as no filter", () => {
    expect(parseCategoryParam(null)).toBeNull();
    expect(parseCategoryParam("")).toBeNull();
  });
});

describe("categoryChoice", () => {
  it("selects the category being filtered on", () => {
    expect(categoryChoice("design")).toBe("design");
  });

  it("never uses the empty value, which Select reserves for its placeholder", () => {
    expect(categoryChoice(null)).not.toBe("");
  });

  it("selects All Categories when nothing is filtered", () => {
    expect(categoryChoice(null)).toBe(ALL_CATEGORIES);
  });

  it("round-trips through parseCategoryParam", () => {
    expect(parseCategoryParam(categoryChoice(null))).toBeNull();
    expect(parseCategoryParam(categoryChoice("design"))).toBe("design");
  });
});
