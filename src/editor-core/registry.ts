import type {
  BlockDefinition,
  BlockRegistry,
  ValidationContext,
} from "./registryTypes";
import type { NodeId, NodeType, ValidationIssue } from "./types";

import { isProbablySafeUrl, isValidCssLengthOrVar } from "./validationUtils";
import { isSafeEmbedDomain, parseVideoUrl } from "./mediaUtils";

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
            { kind: "number", path: "props.columns", label: "Columns", min: 1, max: 6, step: 1, required: true },
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
      } else if (node.props.columns < 1 || node.props.columns > 6) {
        issues.push({
          nodeId: node.id,
          level: "error",
          message: "Columns count must be between 1 and 6.",
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
    allowedChildren: ["container", "text", "image", "button", "spacer", "divider", "video", "embed", "icon", "form", "textInput", "textarea", "selectInput", "checkbox", "radioGroup", "submitButton"],
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
    allowedChildren: ["container", "text", "image", "button", "spacer", "divider", "video", "embed", "icon", "form", "textInput", "textarea", "selectInput", "checkbox", "radioGroup", "submitButton"],
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
    defaultProps: { src: "", alt: "", fit: "cover", borderRadius: "none", aspectRatio: "auto" },
    allowedChildren: [],
    inspector: {
      type: "image",
      groups: [
        {
          label: "Content",
          fields: [
            { kind: "text", path: "props.src", label: "Source URL", placeholder: "Paste image URL or data URI", required: true },
            { kind: "text", path: "props.alt", label: "Alt text", required: true },
            {
              kind: "select",
              path: "props.fit",
              label: "Fit",
              options: [
                { label: "Cover", value: "cover" },
                { label: "Contain", value: "contain" },
                { label: "Fill", value: "fill" },
              ],
            },
            {
              kind: "select",
              path: "props.aspectRatio",
              label: "Aspect ratio",
              options: [
                { label: "Auto", value: "auto" },
                { label: "16:9", value: "16:9" },
                { label: "4:3", value: "4:3" },
                { label: "1:1", value: "1:1" },
              ],
            },
            {
              kind: "select",
              path: "props.borderRadius",
              label: "Border radius",
              options: [
                { label: "None", value: "none" },
                { label: "Small (4px)", value: "sm" },
                { label: "Medium (8px)", value: "md" },
                { label: "Large (16px)", value: "lg" },
                { label: "Full (pill)", value: "full" },
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

  video: {
    type: "video",
    label: "Video",
    defaultProps: { url: "", aspectRatio: "16:9", autoplay: false, loop: false },
    allowedChildren: [],
    inspector: {
      type: "video",
      groups: [
        {
          label: "Video",
          fields: [
            { kind: "text", path: "props.url", label: "YouTube or Vimeo URL", placeholder: "https://youtube.com/watch?v=..." },
            {
              kind: "select",
              path: "props.aspectRatio",
              label: "Aspect ratio",
              options: [
                { label: "16:9 (Widescreen)", value: "16:9" },
                { label: "4:3 (Standard)", value: "4:3" },
                { label: "1:1 (Square)", value: "1:1" },
              ],
            },
            { kind: "toggle", path: "props.autoplay", label: "Autoplay" },
            { kind: "toggle", path: "props.loop", label: "Loop" },
          ],
        },
      ],
    },
    validate(node) {
      const issues: ValidationIssue[] = [];
      if (node.props.url.trim() && !parseVideoUrl(node.props.url)) {
        issues.push({
          nodeId: node.id,
          level: "warning",
          message: "URL must be a valid YouTube or Vimeo video URL.",
          fieldPath: "props.url",
        });
      }
      return issues;
    },
  },

  embed: {
    type: "embed",
    label: "Embed",
    defaultProps: { url: "", width: "100%", height: "400px" },
    allowedChildren: [],
    inspector: {
      type: "embed",
      groups: [
        {
          label: "Embed",
          fields: [
            { kind: "text", path: "props.url", label: "Embed URL", placeholder: "https://..." },
            { kind: "length", path: "props.width", label: "Width" },
            { kind: "length", path: "props.height", label: "Height" },
          ],
        },
      ],
    },
    validate(node) {
      const issues: ValidationIssue[] = [];
      if (node.props.url.trim() && !isSafeEmbedDomain(node.props.url)) {
        issues.push({
          nodeId: node.id,
          level: "error",
          message: "Embed URL domain is not in the allowed list. Allowed: YouTube, Vimeo, Google Maps, CodePen, Figma, Spotify, Twitter/X.",
          fieldPath: "props.url",
        });
      }
      return issues;
    },
  },

  icon: {
    type: "icon",
    label: "Icon",
    defaultProps: { icon: "star", size: 24, color: "currentColor" },
    allowedChildren: [],
    inspector: {
      type: "icon",
      groups: [
        {
          label: "Icon",
          fields: [
            { kind: "icon-picker", path: "props.icon", label: "Icon" },
            { kind: "number", path: "props.size", label: "Size (px)", min: 12, max: 128, step: 1 },
            { kind: "color", path: "props.color", label: "Color" },
          ],
        },
      ],
    },
  },

  form: {
    type: "form",
    label: "Form",
    defaultProps: { action: "", method: "post", name: undefined },
    allowedChildren: ["textInput", "textarea", "selectInput", "checkbox", "radioGroup", "submitButton", "text", "spacer", "divider", "container"],
    inspector: {
      type: "form",
      groups: [
        {
          label: "Settings",
          fields: [
            { kind: "text", path: "props.action", label: "Action URL", placeholder: "https://example.com/submit" },
            {
              kind: "select",
              path: "props.method",
              label: "Method",
              options: [
                { label: "POST", value: "post" },
                { label: "GET", value: "get" },
              ],
            },
            { kind: "text", path: "props.name", label: "Form name (optional)" },
          ],
        },
      ],
    },
    validate(node) {
      const issues: ValidationIssue[] = [];
      const action = node.props.action.trim();
      if (action && !isProbablySafeUrl(action)) {
        issues.push({
          nodeId: node.id,
          level: "error",
          message: "Form action URL is not allowed.",
          fieldPath: "props.action",
        });
      }
      return issues;
    },
  },

  textInput: {
    type: "textInput",
    label: "Text Input",
    defaultProps: { label: "Label", name: "", placeholder: "", inputType: "text", required: false },
    allowedChildren: [],
    inspector: {
      type: "textInput",
      groups: [
        {
          label: "Field",
          fields: [
            { kind: "text", path: "props.label", label: "Label" },
            { kind: "text", path: "props.name", label: "Name (for submission)", required: true },
            { kind: "text", path: "props.placeholder", label: "Placeholder" },
            {
              kind: "select",
              path: "props.inputType",
              label: "Input type",
              options: [
                { label: "Text", value: "text" },
                { label: "Email", value: "email" },
                { label: "Phone", value: "tel" },
                { label: "Number", value: "number" },
                { label: "Password", value: "password" },
              ],
            },
            { kind: "toggle", path: "props.required", label: "Required" },
          ],
        },
      ],
    },
    validate(node) {
      const issues: ValidationIssue[] = [];
      if (!node.props.name.trim()) {
        issues.push({
          nodeId: node.id,
          level: "error",
          message: "Text input must have a name for form submission.",
          fieldPath: "props.name",
        });
      }
      return issues;
    },
  },

  textarea: {
    type: "textarea",
    label: "Textarea",
    defaultProps: { label: "Label", name: "", placeholder: "", rows: 4, required: false },
    allowedChildren: [],
    inspector: {
      type: "textarea",
      groups: [
        {
          label: "Field",
          fields: [
            { kind: "text", path: "props.label", label: "Label" },
            { kind: "text", path: "props.name", label: "Name (for submission)", required: true },
            { kind: "text", path: "props.placeholder", label: "Placeholder" },
            { kind: "number", path: "props.rows", label: "Rows", min: 2, max: 20, step: 1, required: true },
            { kind: "toggle", path: "props.required", label: "Required" },
          ],
        },
      ],
    },
    validate(node) {
      const issues: ValidationIssue[] = [];
      if (!node.props.name.trim()) {
        issues.push({
          nodeId: node.id,
          level: "error",
          message: "Textarea must have a name for form submission.",
          fieldPath: "props.name",
        });
      }
      return issues;
    },
  },

  selectInput: {
    type: "selectInput",
    label: "Select",
    defaultProps: { label: "Label", name: "", options: [{ label: "Option 1", value: "option-1" }], required: false },
    allowedChildren: [],
    inspector: {
      type: "selectInput",
      groups: [
        {
          label: "Field",
          fields: [
            { kind: "text", path: "props.label", label: "Label" },
            { kind: "text", path: "props.name", label: "Name (for submission)" },
            { kind: "toggle", path: "props.required", label: "Required" },
            { kind: "options-list", path: "props.options", label: "Options" },
          ],
        },
      ],
    },
    validate(node) {
      const issues: ValidationIssue[] = [];
      if (!node.props.options || node.props.options.length === 0) {
        issues.push({
          nodeId: node.id,
          level: "error",
          message: "Select must have at least one option.",
          fieldPath: "props.options",
        });
      }
      return issues;
    },
  },

  checkbox: {
    type: "checkbox",
    label: "Checkbox",
    defaultProps: { label: "Check me", name: "", checked: false },
    allowedChildren: [],
    inspector: {
      type: "checkbox",
      groups: [
        {
          label: "Field",
          fields: [
            { kind: "text", path: "props.label", label: "Label" },
            { kind: "text", path: "props.name", label: "Name (for submission)" },
            { kind: "toggle", path: "props.checked", label: "Checked by default" },
          ],
        },
      ],
    },
  },

  radioGroup: {
    type: "radioGroup",
    label: "Radio Group",
    defaultProps: { label: "Choose one", name: "", options: [{ label: "Option 1", value: "option-1" }], required: false },
    allowedChildren: [],
    inspector: {
      type: "radioGroup",
      groups: [
        {
          label: "Field",
          fields: [
            { kind: "text", path: "props.label", label: "Legend" },
            { kind: "text", path: "props.name", label: "Name (for submission)" },
            { kind: "toggle", path: "props.required", label: "Required" },
            { kind: "options-list", path: "props.options", label: "Options" },
          ],
        },
      ],
    },
    validate(node) {
      const issues: ValidationIssue[] = [];
      if (!node.props.options || node.props.options.length === 0) {
        issues.push({
          nodeId: node.id,
          level: "error",
          message: "Radio group must have at least one option.",
          fieldPath: "props.options",
        });
      }
      return issues;
    },
  },

  submitButton: {
    type: "submitButton",
    label: "Submit Button",
    defaultProps: { label: "Submit", variant: "primary" },
    allowedChildren: [],
    inspector: {
      type: "submitButton",
      groups: [
        {
          label: "Button",
          fields: [
            { kind: "text", path: "props.label", label: "Label", required: true },
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
          message: "Submit button label is empty.",
          fieldPath: "props.label",
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
