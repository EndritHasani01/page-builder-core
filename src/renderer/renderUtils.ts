import type { CSSProperties } from "react";

import type { StyleProps, Theme } from "@/editor-core";
import { STYLE_KEYS } from "@/editor-core";

export { resolveResponsiveStyle } from "@/editor-core";

export function stylePropsToCss(style: StyleProps): CSSProperties {
  const out: CSSProperties = {};
  for (const key of STYLE_KEYS) {
    const value = style[key];
    if (value === undefined) continue;
    (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

export function mergeCss(...styles: Array<CSSProperties | undefined>): CSSProperties {
  const out: CSSProperties = {};
  for (const s of styles) {
    if (!s) continue;
    Object.assign(out, s);
  }
  return out;
}

export function themeToCssVars(theme: Theme): CSSProperties {
  const vars: Record<string, string> = {
    "--color-bg": theme.colors.background,
    "--color-text": theme.colors.text,
    "--color-primary": theme.colors.primary,
    "--color-border": theme.colors.border,
    "--font-body": theme.typography.fontFamily,
    "--text-base": theme.typography.baseFontSize,
    "--space-unit": theme.spacing.unit,
  };

  for (let i = 1; i <= 10; i++) {
    vars[`--space-${i}`] = i === 1 ? "var(--space-unit)" : `calc(var(--space-unit) * ${i})`;
  }

  return vars as CSSProperties;
}
