import { nanoid } from "nanoid";

import type { NodeId, NodeType } from "./types";
import { NODE_TYPES } from "./constants";

export type IdFactory = {
  nextId: (type: NodeType) => NodeId;
};

const deterministicIdRegex = new RegExp(`^(${NODE_TYPES.join("|")})_(\\d+)$`);

export function parseDeterministicId(id: string): { type: NodeType; n: number } | null {
  const match = deterministicIdRegex.exec(id);
  if (!match) return null;
  const [, type, num] = match;
  return { type: type as NodeType, n: Number(num) };
}

export function createDeterministicIdFactory(opts?: {
  startAt?: Partial<Record<NodeType, number>>;
}): IdFactory {
  const counters = new Map<NodeType, number>();
  for (const type of NODE_TYPES) {
    counters.set(type, opts?.startAt?.[type] ?? 1);
  }

  return {
    nextId(type) {
      const current = counters.get(type) ?? 1;
      counters.set(type, current + 1);
      return `${type}_${current}`;
    },
  };
}

export function createNanoidFactory(opts?: { size?: number }): IdFactory {
  const size = opts?.size ?? 10;
  return {
    nextId(type) {
      return `${type}_${nanoid(size)}`;
    },
  };
}

