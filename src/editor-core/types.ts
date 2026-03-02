import type { BREAKPOINTS, LATEST_SCHEMA_VERSION, NODE_TYPES } from "./constants";

export type SchemaVersion = typeof LATEST_SCHEMA_VERSION;

export type NodeId = string;
export type NodeType = (typeof NODE_TYPES)[number];
export type Breakpoint = (typeof BREAKPOINTS)[number];

export type Responsive<T> = {
  base: T;
  sm?: Partial<T>;
  md?: Partial<T>;
  lg?: Partial<T>;
};

export type StyleProps = {
  display?: "block" | "flex";
  flexDirection?: "row" | "column";
  justifyContent?: "flex-start" | "center" | "flex-end" | "space-between";
  alignItems?: "stretch" | "flex-start" | "center" | "flex-end";
  gap?: string;

  padding?: string;
  margin?: string;
  width?: string;
  maxWidth?: string;
  minHeight?: string;

  fontFamily?: string;
  fontSize?: string;
  fontWeight?: number | string;
  lineHeight?: string;
  textAlign?: "left" | "center" | "right";
  color?: string;

  backgroundColor?: string;
  borderRadius?: string;
  border?: string;
  boxShadow?: string;
  opacity?: number;
};

export type NodeConstraints = {
  locked?: boolean;
  hidden?: boolean;
  draggable?: boolean;
  deletable?: boolean;
  droppable?: boolean;
};

export type NodeCommon = {
  id: NodeId;
  type: NodeType;
  parentId: NodeId | null;
  children: NodeId[];
  constraints?: NodeConstraints;
  style?: Responsive<StyleProps>;
};

export type PageProps = {
  title: string;
  lang: string;
};

export type SectionProps = {
  variant: "default" | "hero";
  fullWidth: boolean;
};

export type ColumnsProps = {
  columns: number; // constrained by registry
  gap: string;
};

export type ColumnProps = {
  width?: string;
};

export type ContainerProps = {
  as: "div" | "main" | "header" | "footer";
};

export type InlineSegment = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  link?: { href: string };
};

export type RichContent = InlineSegment[];

export type TextProps = {
  content: RichContent;
  as: "p" | "h1" | "h2" | "h3" | "span";
  listType?: "ul" | "ol";
};

export type ImageProps = {
  src: string;
  alt: string;
  fit: "cover" | "contain";
  linkTo?: string;
};

export type ButtonProps = {
  label: string;
  href: string; // empty string means no navigation
  variant: "primary" | "secondary";
};

export type SpacerProps = {
  height: string;
};

export type DividerProps = {
  thickness: string;
  color: string;
};

export type NodePropsByType = {
  page: PageProps;
  section: SectionProps;
  columns: ColumnsProps;
  column: ColumnProps;
  container: ContainerProps;
  text: TextProps;
  image: ImageProps;
  button: ButtonProps;
  spacer: SpacerProps;
  divider: DividerProps;
};

export type NodeByType = {
  [T in NodeType]: NodeCommon & { type: T; props: NodePropsByType[T] };
};

export type Node = NodeByType[NodeType];

export type DocumentMeta = {
  schemaVersion: SchemaVersion;
  createdAt: string;
  updatedAt: string;
  title: string;
};

export type Theme = {
  colors: {
    background: string;
    text: string;
    primary: string;
    border: string;
  };
  typography: {
    fontFamily: string;
    baseFontSize: string;
    scale: number;
  };
  spacing: {
    unit: string;
  };
  breakpoints: {
    sm: number;
    md: number;
    lg: number;
  };
};

export type Document = {
  meta: DocumentMeta;
  theme: Theme;
  rootId: NodeId;
  nodes: Record<NodeId, Node>;
};

export type ValidationIssue = {
  nodeId: NodeId;
  level: "error" | "warning";
  message: string;
  fieldPath?: string;
};

export type InspectorField =
  | {
      kind: "text";
      path: string;
      label: string;
      placeholder?: string;
      required?: boolean;
    }
  | {
      kind: "number";
      path: string;
      label: string;
      min?: number;
      max?: number;
      step?: number;
      placeholder?: string;
      required?: boolean;
    }
  | {
      kind: "select";
      path: string;
      label: string;
      options: { label: string; value: string }[];
      required?: boolean;
    }
  | { kind: "color"; path: string; label: string; required?: boolean }
  | { kind: "length"; path: string; label: string; tokens?: string[]; required?: boolean }
  | { kind: "toggle"; path: string; label: string; required?: boolean }
  | { kind: "info"; path: string; label: string; message: string };

export type InspectorGroup = {
  label: string;
  fields: InspectorField[];
};

export type InspectorSchema<T extends NodeType> = {
  type: T;
  groups: InspectorGroup[];
};

export type Subtree = {
  rootId: NodeId;
  nodes: Record<NodeId, Node>;
};
