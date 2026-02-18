import type { InspectorSchema, NodeByType, NodeType, ValidationIssue } from "./types";

export type ChildConstraints = {
  minChildren?: number;
  maxChildren?: number;
  exactChildren?: number;
};

export type ValidationContext = {
  doc: import("./types").Document;
};

export type BlockDefinition<T extends NodeType> = {
  type: T;
  label: string;
  defaultProps: import("./types").NodePropsByType[T];
  defaultStyle?: import("./types").Responsive<import("./types").StyleProps>;
  allowedChildren: NodeType[];
  constraints?: ChildConstraints;
  inspector?: InspectorSchema<T>;
  validate?: (node: NodeByType[T], ctx: ValidationContext) => ValidationIssue[];
};

export type BlockRegistry = {
  [T in NodeType]: BlockDefinition<T>;
};

