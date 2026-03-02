import type {
  BlockDefinition,
  BlockRegistry,
  ValidationContext,
} from "./registryTypes";
import type { NodeId, NodeType, ValidationIssue } from "./types";

import { isProbablySafeUrl, isValidCssLengthOrVar } from "./validationUtils";

export const blockRegistry: BlockRegistry = {
  page: {
    type: "page",
    label: "Page",
    defaultProps: { title: "Untitled", lang: "en" },
    allowedChildren: ["section"],
    constraints: { minChildren: 0 },
    inspector: {
      type: "page",
      groups: [
        {
          label: "Content",
          fields: [
            { kind: "text", path: "props.title", label: "Title" },
            { kind: "text", path: "props.lang", label: "Language", placeholder: "en" },
          ],
        },
      ],
    },
    validate(node) {
      const issues: ValidationIssue[] = [];
      if (!node.props.title.trim()) {
        issues.push({
          nodeId: node.id,
          level: "warning",
          message: "Page title is empty.",
          fieldPath: "props.title",
        });
      }
      return issues;
    },
  },

  section: {
    type: "section",
    label: "Section",
    defaultProps: { variant: "default", fullWidth: false },
    allowedChildren: ["columns"],
    constraints: { exactChildren: 1 },
    inspector: {
      type: "section",
      groups: [
        {
          label: "Content",
          fields: [
            {
              kind: "select",
              path: "props.variant",
              label: "Variant",
              options: [
                { label: "Default", value: "default" },
                { label: "Hero", value: "hero" },
              ],
            },
            { kind: "toggle", path: "props.fullWidth", label: "Full width" },
          ],
        },
      ],
    },
    validate(node) {
      const issues: ValidationIssue[] = [];
      if (node.children.length !== 1) {
        issues.push({
          nodeId: node.id,
          level: "error",
          message: "Section must contain exactly one layout child.",
          fieldPath: "children",
        });
      }
      return issues;
    },
  },

  columns: {
    type: "columns",
    label: "Columns",
    defaultProps: { columns: 2, gap: "var(--space-4)" },
    allowedChildren: ["column"],
    inspector: {
      type: "columns",
      groups: [
        {
          label: "Layout",
          fields: [
            { kind: "number", path: "props.columns", label: "Columns", min: 2, max: 6, step: 1, required: true },
            { kind: "length", path: "props.gap", label: "Gap", tokens: ["var(--space-2)", "var(--space-4)"] },
          ],
        },
      ],
    },
    validate(node) {
      const issues: ValidationIssue[] = [];
      if (!Number.isInteger(node.props.columns)) {
        issues.push({
          nodeId: node.id,
          level: "error",
          message: "Columns count must be an integer.",
          fieldPath: "props.columns",
        });
      } else if (node.props.columns < 2 || node.props.columns > 6) {
        issues.push({
          nodeId: node.id,
          level: "error",
          message: "Columns count must be between 2 and 6.",
          fieldPath: "props.columns",
        });
      }
      if (node.children.length !== node.props.columns) {
        issues.push({
          nodeId: node.id,
          level: "error",
          message: "Number of Column children must match the columns setting.",
          fieldPath: "children",
        });
      }
      return issues;
    },
  },

  column: {
    type: "column",
    label: "Column",
    defaultProps: {},
    allowedChildren: ["container", "text", "image", "button", "spacer", "divider"],
    inspector: {
      type: "column",
      groups: [
        {
          label: "Layout",
          fields: [{ kind: "length", path: "props.width", label: "Width (optional)" }],
        },
      ],
    },
  },

  container: {
    type: "container",
    label: "Container",
    defaultProps: { as: "div" },
    allowedChildren: ["container", "text", "image", "button", "spacer", "divider"],
    inspector: {
      type: "container",
      groups: [
        {
          label: "Content",
          fields: [
            {
              kind: "select",
              path: "props.as",
              label: "Element",
              options: [
                { label: "div", value: "div" },
                { label: "main", value: "main" },
                { label: "header", value: "header" },
                { label: "footer", value: "footer" },
              ],
            },
          ],
        },
      ],
    },
  },

  text: {
    type: "text",
    label: "Text",
    defaultProps: { content: [{ text: "Text" }], as: "p" },
    allowedChildren: [],
    inspector: {
      type: "text",
      groups: [
        {
          label: "Content",
          fields: [
            {
              kind: "info",
              path: "_richtext",
              label: "Content",
              message: "Edit text directly on the canvas by double-clicking.",
            },
          ],
        },
        {
          label: "Semantics",
          fields: [
            {
              kind: "select",
              path: "props.as",
              label: "Element",
              options: [
                { label: "p", value: "p" },
                { label: "h1", value: "h1" },
                { label: "h2", value: "h2" },
                { label: "h3", value: "h3" },
                { label: "span", value: "span" },
              ],
            },
            {
              kind: "select",
              path: "props.listType",
              label: "List type",
              options: [
                { label: "Unordered (ul)", value: "ul" },
                { label: "Ordered (ol)", value: "ol" },
              ],
            },
          ],
        },
      ],
    },
    validate(node) {
      const issues: ValidationIssue[] = [];
      const plain = node.props.content.map((s) => s.text).join("").trim();
      if (!plain) {
        issues.push({
          nodeId: node.id,
          level: "warning",
          message: "Text is empty.",
          fieldPath: "props.content",
        });
      }
      for (const seg of node.props.content) {
        if (seg.link?.href && !isProbablySafeUrl(seg.link.href)) {
          issues.push({
            nodeId: node.id,
            level: "error",
            message: `Inline link URL is not allowed: ${seg.link.href}`,
            fieldPath: "props.content",
          });
          break;
        }
      }
      return issues;
    },
  },

  image: {
    type: "image",
    label: "Image",
    defaultProps: { src: "", alt: "", fit: "cover" },
    allowedChildren: [],
    inspector: {
      type: "image",
      groups: [
        {
          label: "Content",
          fields: [
            { kind: "text", path: "props.src", label: "Source URL", required: true },
            { kind: "text", path: "props.alt", label: "Alt text", required: true },
            {
              kind: "select",
              path: "props.fit",
              label: "Fit",
              options: [
                { label: "Cover", value: "cover" },
                { label: "Contain", value: "contain" },
              ],
            },
            { kind: "text", path: "props.linkTo", label: "Link URL (optional)" },
          ],
        },
      ],
    },
    validate(node) {
      const issues: ValidationIssue[] = [];
      if (!node.props.src.trim()) {
        issues.push({
          nodeId: node.id,
          level: "error",
          message: "Image source URL is required.",
          fieldPath: "props.src",
        });
      } else if (!isProbablySafeUrl(node.props.src)) {
        issues.push({
          nodeId: node.id,
          level: "error",
          message: "Image source URL is not allowed.",
          fieldPath: "props.src",
        });
      }

      if (!node.props.alt.trim()) {
        issues.push({
          nodeId: node.id,
          level: "warning",
          message: "Alt text is empty.",
          fieldPath: "props.alt",
        });
      }

      if (node.props.linkTo && node.props.linkTo.trim() && !isProbablySafeUrl(node.props.linkTo)) {
        issues.push({
          nodeId: node.id,
          level: "error",
          message: "Image link URL is not allowed.",
          fieldPath: "props.linkTo",
        });
      }
      return issues;
    },
  },

  button: {
    type: "button",
    label: "Button",
    defaultProps: { label: "Button", href: "", variant: "primary" },
    allowedChildren: [],
    inspector: {
      type: "button",
      groups: [
        {
          label: "Content",
          fields: [
            { kind: "text", path: "props.label", label: "Label", required: true },
            { kind: "text", path: "props.href", label: "Link URL (optional)" },
            {
              kind: "select",
              path: "props.variant",
              label: "Variant",
              options: [
                { label: "Primary", value: "primary" },
                { label: "Secondary", value: "secondary" },
              ],
            },
          ],
        },
      ],
    },
    validate(node) {
      const issues: ValidationIssue[] = [];
      if (!node.props.label.trim()) {
        issues.push({
          nodeId: node.id,
          level: "warning",
          message: "Button label is empty.",
          fieldPath: "props.label",
        });
      }

      if (node.props.href.trim() && !isProbablySafeUrl(node.props.href)) {
        issues.push({
          nodeId: node.id,
          level: "error",
          message: "Button link URL is not allowed.",
          fieldPath: "props.href",
        });
      }
      return issues;
    },
  },

  spacer: {
    type: "spacer",
    label: "Spacer",
    defaultProps: { height: "24px" },
    allowedChildren: [],
    inspector: {
      type: "spacer",
      groups: [
        { label: "Layout", fields: [{ kind: "length", path: "props.height", label: "Height", required: true }] },
      ],
    },
    validate(node) {
      if (isValidCssLengthOrVar(node.props.height)) return [];
      return [
        {
          nodeId: node.id,
          level: "warning",
          message: "Spacer height does not look like a CSS length or variable token.",
          fieldPath: "props.height",
        },
      ];
    },
  },

  divider: {
    type: "divider",
    label: "Divider",
    defaultProps: { thickness: "1px", color: "var(--color-border)" },
    allowedChildren: [],
    inspector: {
      type: "divider",
      groups: [
        {
          label: "Style",
          fields: [
            { kind: "length", path: "props.thickness", label: "Thickness", required: true },
            { kind: "color", path: "props.color", label: "Color" },
          ],
        },
      ],
    },
    validate(node) {
      const issues: ValidationIssue[] = [];
      if (!isValidCssLengthOrVar(node.props.thickness)) {
        issues.push({
          nodeId: node.id,
          level: "warning",
          message: "Divider thickness does not look like a CSS length or variable token.",
          fieldPath: "props.thickness",
        });
      }
      return issues;
    },
  },
};

export function getBlock<T extends NodeType>(type: T): BlockDefinition<T> {
  return blockRegistry[type];
}

export function isAllowedChild(parentType: NodeType, childType: NodeType): boolean {
  return blockRegistry[parentType].allowedChildren.includes(childType);
}

export function validateNodeWithRegistry(ctx: ValidationContext, nodeId: NodeId): ValidationIssue[] {
  const node = ctx.doc.nodes[nodeId];
  if (!node) return [];
  const def = blockRegistry[node.type];
  return def.validate ? def.validate(node as never, ctx) : [];
}
