import { describe, it, expect } from "vitest";
import { MAX_NOTE_LENGTH } from "~/lib/notes";
import { noteDraft } from "../index";

describe("noteDraft", () => {
  it("is empty, with Save off, before anything is typed", () => {
    expect(noteDraft("", null)).toEqual({
      status: "empty",
      canSave: false,
      counter: "0 / 2,000",
    });
  });

  it("treats whitespace alone as empty", () => {
    expect(noteDraft("   \n  ", null)).toMatchObject({
      status: "empty",
      canSave: false,
    });
  });

  it("offers Save for a first draft", () => {
    expect(noteDraft("Narrowing with typeof", null)).toEqual({
      status: "unsaved",
      canSave: true,
      counter: "21 / 2,000",
    });
  });

  it("is saved, with Save off, when the box matches the saved Note", () => {
    expect(noteDraft("Use `in` to narrow", "Use `in` to narrow")).toEqual({
      status: "saved",
      canSave: false,
      counter: "18 / 2,000",
    });
  });

  it("ignores surrounding whitespace when comparing with the saved Note", () => {
    expect(noteDraft("  same  \n", "same")).toMatchObject({ status: "saved" });
  });

  it("offers Save once the box differs from the saved Note", () => {
    expect(noteDraft("same, and more", "same")).toMatchObject({
      status: "unsaved",
      canSave: true,
    });
  });

  it("is empty when a saved Note is cleared, because an empty Note is refused", () => {
    expect(noteDraft("", "something")).toMatchObject({
      status: "empty",
      canSave: false,
    });
  });

  it("allows exactly the maximum length", () => {
    expect(noteDraft("a".repeat(MAX_NOTE_LENGTH), null)).toEqual({
      status: "unsaved",
      canSave: true,
      counter: "2,000 / 2,000",
    });
  });

  it("refuses one character over the maximum", () => {
    expect(noteDraft("a".repeat(MAX_NOTE_LENGTH + 1), null)).toEqual({
      status: "too-long",
      canSave: false,
      counter: "2,001 / 2,000",
    });
  });

  it("counts the trimmed length against the maximum", () => {
    expect(noteDraft(`  ${"a".repeat(MAX_NOTE_LENGTH)}  `, null)).toMatchObject(
      { status: "unsaved", counter: "2,000 / 2,000" }
    );
  });
});
