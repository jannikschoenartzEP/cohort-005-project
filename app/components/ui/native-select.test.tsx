import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NativeSelect } from "./native-select";

function render(element: React.ReactElement) {
  const html = renderToStaticMarkup(element);
  const classesOf = (tag: string): string[] => {
    const match = html.match(new RegExp(`<${tag}[^>]*class="([^"]*)"`));
    return match ? match[1].split(/\s+/) : [];
  };
  return { html, classesOf };
}

describe("NativeSelect", () => {
  it("hides the browser's own arrow and leaves room for its chevron", () => {
    const view = render(
      <NativeSelect name="category" defaultValue="">
        <option value="">All Categories</option>
      </NativeSelect>
    );

    expect(view.classesOf("select")).toEqual(
      expect.arrayContaining(["appearance-none", "pr-9"])
    );
  });

  it("draws its own focus ring, so no caller has to", () => {
    const view = render(<NativeSelect />);

    expect(view.classesOf("select")).toEqual(
      expect.arrayContaining([
        "focus-visible:outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-ring",
      ])
    );
  });

  it("draws a chevron inset from the right edge that never takes a click", () => {
    const view = render(<NativeSelect />);

    expect(view.classesOf("svg")).toEqual(
      expect.arrayContaining(["pointer-events-none", "absolute", "right-3"])
    );
    expect(view.html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("keeps the form field: name, value and options reach the select", () => {
    const view = render(
      <NativeSelect name="category" defaultValue="design">
        <option value="">All Categories</option>
        <option value="design">Design</option>
      </NativeSelect>
    );

    expect(view.html).toContain('name="category"');
    expect(view.html).toMatch(/<option value="design" selected="">Design/);
  });

  it("merges the caller's classes onto the select", () => {
    const view = render(<NativeSelect className="h-10 pr-12" />);

    expect(view.classesOf("select")).toEqual(
      expect.arrayContaining(["h-10", "pr-12"])
    );
    expect(view.classesOf("select")).not.toContain("pr-9");
  });
});
