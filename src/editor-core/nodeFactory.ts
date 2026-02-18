import { createNanoidFactory, type IdFactory } from "./ids";
import type { NodeByType, NodeConstraints, NodeId, NodePropsByType, NodeType } from "./types";
import { blockRegistry } from "./registry";
import { deepClone } from "./deepClone";

export type CreateNodeOptions<T extends NodeType> = {
  id?: NodeId;
  idFactory?: IdFactory;
  parentId?: NodeId | null;
  children?: NodeId[];
  constraints?: NodeConstraints;
  style?: NodeByType[T]["style"];
  props?: Partial<NodePropsByType[T]>;
};

const defaultIdFactory = createNanoidFactory();

export function createNode<T extends NodeType>(type: T, opts?: CreateNodeOptions<T>): NodeByType[T] {
  const def = blockRegistry[type];
  const id = opts?.id ?? (opts?.idFactory ?? defaultIdFactory).nextId(type);

  const node = {
    id,
    type,
    parentId: opts?.parentId ?? null,
    children: opts?.children ? [...opts.children] : [],
    constraints: opts?.constraints ? deepClone(opts.constraints) : undefined,
    style: opts?.style ? deepClone(opts.style) : def.defaultStyle ? deepClone(def.defaultStyle) : undefined,
    props: { ...deepClone(def.defaultProps), ...(opts?.props ?? {}) },
  } as NodeByType[T];

  return node;
}
