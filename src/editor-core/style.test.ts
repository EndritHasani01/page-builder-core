import { describe, expect, test } from "vitest";

import type { Responsive, StyleProps } from "@/editor-core";
import { getInheritedStyleValue, isStyleKeyOverridden, resolveResponsiveStyle } from "@/editor-core";

describe("style utilities", () => {
  test("resolveResponsiveStyle cascades base -> sm -> md -> lg", () => {
    const style: Responsive<StyleProps> = {
      base: { padding: "4px", color: "red" },
      sm: { padding: "8px" },
      md: { color: "blue" },
    };

    expect(resolveResponsiveStyle(style, "base")).toEqual({ padding: "4px", color: "red" });
    expect(resolveResponsiveStyle(style, "sm")).toEqual({ padding: "8px", color: "red" });
    expect(resolveResponsiveStyle(style, "md")).toEqual({ padding: "8px", color: "blue" });
    expect(resolveResponsiveStyle(style, "lg")).toEqual({ padding: "8px", color: "blue" });
  });

  test("isStyleKeyOverridden checks the current breakpoint bucket", () => {
    const style: Responsive<StyleProps> = {
      base: { padding: "4px", color: "red" },
      sm: { padding: "8px" },
      md: { color: "blue" },
    };

    expect(isStyleKeyOverridden(style, "base", "padding")).toBe(true);
    expect(isStyleKeyOverridden(style, "sm", "padding")).toBe(true);
    expect(isStyleKeyOverridden(style, "md", "padding")).toBe(false);
    expect(isStyleKeyOverridden(style, "md", "color")).toBe(true);
  });

  test("getInheritedStyleValue reads the previous breakpoint effective value", () => {
    const style: Responsive<StyleProps> = {
      base: { padding: "4px", color: "red" },
      sm: { padding: "8px" },
      md: { color: "blue" },
    };

    expect(getInheritedStyleValue(style, "md", "padding")).toBe("8px");
    expect(getInheritedStyleValue(style, "md", "color")).toBe("red");
    expect(getInheritedStyleValue(style, "base", "padding")).toBeUndefined();
  });
});

