export type TokenOption = { label: string; value: string };

export const COLOR_TOKENS: TokenOption[] = [
  { label: "Background", value: "var(--color-bg)" },
  { label: "Text", value: "var(--color-text)" },
  { label: "Primary", value: "var(--color-primary)" },
  { label: "Border", value: "var(--color-border)" },
];

export const FONT_FAMILY_TOKENS: TokenOption[] = [
  { label: "Body", value: "var(--font-body)" },
];

export const FONT_SIZE_TOKENS: TokenOption[] = [
  { label: "Base", value: "var(--text-base)" },
];

export function getSpacingTokens(max: number = 10): TokenOption[] {
  const out: TokenOption[] = [];
  for (let i = 1; i <= max; i++) {
    out.push({ label: `Space ${i}`, value: `var(--space-${i})` });
  }
  return out;
}

