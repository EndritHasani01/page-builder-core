import { BREAKPOINTS } from "./constants";
import type { Breakpoint, Responsive, StyleProps } from "./types";

export const STYLE_KEYS = [
  "display",
  "flexDirection",
  "justifyContent",
  "alignItems",
  "gap",
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "width",
  "maxWidth",
  "minHeight",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "textAlign",
  "color",
  "backgroundColor",
  "borderRadius",
  "border",
  "boxShadow",
  "opacity",
] as const satisfies ReadonlyArray<keyof StyleProps>;

export function resolveResponsiveStyle(
  style: Responsive<StyleProps> | undefined,
  breakpoint: Breakpoint,
): StyleProps {
  if (!style) return {};

  const base = style.base ?? {};
  if (breakpoint === "base") return { ...base };

  const sm = style.sm ?? {};
  if (breakpoint === "sm") return { ...base, ...sm };

  const md = style.md ?? {};
  if (breakpoint === "md") return { ...base, ...sm, ...md };

  const lg = style.lg ?? {};
  return { ...base, ...sm, ...md, ...lg };
}

export function previousBreakpoint(breakpoint: Breakpoint): Breakpoint | null {
  const idx = BREAKPOINTS.indexOf(breakpoint);
  if (idx <= 0) return null;
  return BREAKPOINTS[idx - 1] ?? null;
}

export function isStyleKeyOverridden<K extends keyof StyleProps>(
  style: Responsive<StyleProps> | undefined,
  breakpoint: Breakpoint,
  key: K,
): boolean {
  if (!style) return false;
  const bucket = breakpoint === "base" ? style.base : style[breakpoint];
  if (!bucket) return false;
  return Object.prototype.hasOwnProperty.call(bucket, key);
}

export function getEffectiveStyleValue<K extends keyof StyleProps>(
  style: Responsive<StyleProps> | undefined,
  breakpoint: Breakpoint,
  key: K,
): StyleProps[K] | undefined {
  return resolveResponsiveStyle(style, breakpoint)[key] as StyleProps[K] | undefined;
}

export function getInheritedStyleValue<K extends keyof StyleProps>(
  style: Responsive<StyleProps> | undefined,
  breakpoint: Breakpoint,
  key: K,
): StyleProps[K] | undefined {
  const prev = previousBreakpoint(breakpoint);
  if (!prev) return undefined;
  return getEffectiveStyleValue(style, prev, key);
}

