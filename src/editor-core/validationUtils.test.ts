import { describe, expect, test } from "vitest";

import { isProbablySafeUrl } from "@/editor-core";

describe("isProbablySafeUrl", () => {
  test("allows common safe URL forms", () => {
    expect(isProbablySafeUrl("https://example.com")).toBe(true);
    expect(isProbablySafeUrl("http://example.com")).toBe(true);
    expect(isProbablySafeUrl("mailto:test@example.com")).toBe(true);
    expect(isProbablySafeUrl("tel:+123456789")).toBe(true);

    expect(isProbablySafeUrl("#section-1")).toBe(true);
    expect(isProbablySafeUrl("/docs/getting-started")).toBe(true);
    expect(isProbablySafeUrl("./relative/path")).toBe(true);
    expect(isProbablySafeUrl("../up-one")).toBe(true);
  });

  test("rejects dangerous schemes even when obfuscated", () => {
    expect(isProbablySafeUrl("javascript:alert(1)")).toBe(false);
    expect(isProbablySafeUrl("JaVaScRiPt:alert(1)")).toBe(false);
    expect(isProbablySafeUrl("java\nscript:alert(1)")).toBe(false);
    expect(isProbablySafeUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isProbablySafeUrl("data:text/html,<svg onload=alert(1)>")).toBe(false);
  });

  test("rejects URLs with whitespace/control characters", () => {
    expect(isProbablySafeUrl("ht\ntps://example.com")).toBe(false);
    expect(isProbablySafeUrl("https://exa mple.com")).toBe(false);
    expect(isProbablySafeUrl("/path with space")).toBe(false);
    expect(isProbablySafeUrl("#hash with space")).toBe(false);
  });
});

