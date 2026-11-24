import { describe, it, expect } from "vitest";
import { greet } from "../index";

describe("greet", () => {
  it("greets by name", () => {
    expect(greet("Ada")).toBe("Hello, Ada!");
  });

  it("falls back when the name is blank", () => {
    expect(greet("   ")).toBe("Hello, stranger!");
  });
});
