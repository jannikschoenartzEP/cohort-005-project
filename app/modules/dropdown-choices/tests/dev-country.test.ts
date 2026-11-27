import { describe, expect, it } from "vitest";
import {
  AUTO_DETECT_COUNTRY,
  devCountryChoice,
  parseDevCountry,
} from "../dev-country";

describe("parseDevCountry", () => {
  it("keeps a two-letter country code", () => {
    expect(parseDevCountry("IN")).toBe("IN");
  });

  it("reads the Auto-detect choice as no override", () => {
    expect(parseDevCountry(AUTO_DETECT_COUNTRY)).toBeNull();
  });

  it("reads an empty or missing value as no override", () => {
    expect(parseDevCountry("")).toBeNull();
    expect(parseDevCountry(null)).toBeNull();
  });

  it("rejects anything that is not a country code", () => {
    expect(parseDevCountry("IND")).toBeNull();
    expect(parseDevCountry("X")).toBeNull();
    expect(parseDevCountry(new File([], "in.txt"))).toBeNull();
  });
});

describe("devCountryChoice", () => {
  it("selects the overridden country", () => {
    expect(devCountryChoice("IN")).toBe("IN");
  });

  it("never uses the empty value, which Select reserves for its placeholder", () => {
    expect(devCountryChoice(null)).not.toBe("");
  });

  it("selects Auto-detect when nothing is overridden", () => {
    expect(devCountryChoice(null)).toBe(AUTO_DETECT_COUNTRY);
  });
});
