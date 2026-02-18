import type { NodeId, NodeType } from "@/editor-core";

export type DragPayload =
  | {
      kind: "palette";
      nodeType: NodeType;
    }
  | {
      kind: "node";
      nodeId: NodeId;
    };

export type DropTarget = {
  parentId: NodeId;
  index: number;
};

