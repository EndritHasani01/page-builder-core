const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

function hasControlOrWhitespace(input: string): boolean {
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
    if (input[i].trim() === "") return true;
  }
  return false;
}

export function isProbablySafeUrl(input: string): boolean {
  const value = input.trim();
  if (!value) return false;
  if (hasControlOrWhitespace(value)) return false;

  if (value.startsWith("#")) return true;
  if (value.startsWith("/")) return true;
  if (value.startsWith("./") || value.startsWith("../")) return true;

  try {
    const url = new URL(value);
    return SAFE_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

const cssLengthOrVarRegex =
  /^(var\(--[a-zA-Z0-9-_]+\)|-?\d+(\.\d+)?(px|rem|em|vh|vw|%|ch|ex|vmin|vmax)|0)$/;

export function isValidCssLengthOrVar(value: string): boolean {
  return cssLengthOrVarRegex.test(value.trim());
}
