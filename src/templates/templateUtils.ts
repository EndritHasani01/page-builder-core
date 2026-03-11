import type { Node } from "@/editor-core";

export function collect(...ns: Node[]): Record<string, Node> {
  const out: Record<string, Node> = {};
  for (const n of ns) out[n.id] = n;
  return out;
}
