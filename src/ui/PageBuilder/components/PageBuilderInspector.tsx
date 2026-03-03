import type { ChangeEvent } from "react";
import { Fragment, useState } from "react";

import type { Breakpoint, Document, NodeId, NodeType, StyleProps, ValidationIssue } from "@/editor-core";
import { ICON_DATA, ICON_NAMES } from "@/icons";
import {
  COLOR_TOKENS,
  FONT_FAMILY_TOKENS,
  FONT_SIZE_TOKENS,
  blockRegistry,
  getEffectiveStyleValue,
  getInheritedStyleValue,
  getSpacingTokens,
  isStyleKeyOverridden,
} from "@/editor-core";
import type { DispatchOptions, EditorAction, Mode } from "@/store";
import { useEditorStore } from "@/store";

import styles from "../PageBuilder.module.css";
import { BoxModelEditor } from "./BoxModelEditor";

// ─── Section visibility ──────────────────────────────────────────────────────

const LAYOUT_TYPES: NodeType[] = ["section", "columns", "column", "container"];
const TYPOGRAPHY_TYPES: NodeType[] = ["text", "button"];
const SPACING_TYPES: NodeType[] = ["section", "columns", "column", "container", "text", "image", "button"];
const APPEARANCE_TYPES: NodeType[] = ["section", "columns", "column", "container", "text", "image", "button"];

// ─── Quick type-switch config ─────────────────────────────────────────────────

type VariantOption = { label: string; value: string };

function getVariantPropKey(type: NodeType): "as" | "variant" | null {
  if (type === "text" || type === "container") return "as";
  if (type === "section" || type === "button") return "variant";
  return null;
}

function getVariantOptions(type: NodeType): VariantOption[] | null {
  if (type === "text") {
    return [
      { label: "p", value: "p" },
      { label: "h1", value: "h1" },
      { label: "h2", value: "h2" },
      { label: "h3", value: "h3" },
      { label: "span", value: "span" },
    ];
  }
  if (type === "container") {
    return [
      { label: "div", value: "div" },
      { label: "main", value: "main" },
      { label: "header", value: "header" },
      { label: "footer", value: "footer" },
    ];
  }
  if (type === "section") {
    return [
      { label: "default", value: "default" },
      { label: "hero", value: "hero" },
    ];
  }
  if (type === "button") {
    return [
      { label: "primary", value: "primary" },
      { label: "secondary", value: "secondary" },
    ];
  }
  return null;
}

// ─── Style section field helpers ──────────────────────────────────────────────

const LAYOUT_STYLE_KEYS: (keyof StyleProps)[] = ["display", "flexDirection", "justifyContent", "alignItems", "gap"];
const SPACING_STYLE_KEYS: (keyof StyleProps)[] = [
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
];
const TYPOGRAPHY_STYLE_KEYS: (keyof StyleProps)[] = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "textAlign",
  "color",
];
const APPEARANCE_STYLE_KEYS: (keyof StyleProps)[] = [
  "backgroundColor",
  "borderRadius",
  "border",
  "boxShadow",
  "opacity",
];

function hasAnyStyleValue(
  style: import("@/editor-core").Responsive<StyleProps> | undefined,
  keys: (keyof StyleProps)[],
): boolean {
  if (!style) return false;
  const buckets = [style.base, style.sm, style.md, style.lg].filter(Boolean) as Partial<StyleProps>[];
  return buckets.some((b) => keys.some((k) => k in b));
}

function hasContentOverrides(node: { type: NodeType; props: Record<string, unknown> }): boolean {
  const def = blockRegistry[node.type];
  const defaults = def.defaultProps as Record<string, unknown>;
  return Object.keys(defaults).some((k) => {
    const v = node.props[k];
    const d = defaults[k];
    return JSON.stringify(v) !== JSON.stringify(d);
  });
}

// ─── Public component ─────────────────────────────────────────────────────────

export function PageBuilderInspector() {
  const doc = useEditorStore((s) => s.doc);
  const issues = useEditorStore((s) => s.issues);
  const selectedId = useEditorStore((s) => s.selectedId);
  const mode = useEditorStore((s) => s.mode);
  const breakpoint = useEditorStore((s) => s.breakpoint);
  const dispatch = useEditorStore((s) => s.dispatch);

  const node = selectedId ? doc.nodes[selectedId] : undefined;
  if (!node) {
    return <p className={styles.muted}>Select a node to edit.</p>;
  }

  return (
    <InspectorPanel
      key={selectedId}
      doc={doc}
      issues={issues}
      selectedId={selectedId!}
      mode={mode}
      breakpoint={breakpoint}
      dispatch={dispatch}
    />
  );
}

// ─── InspectorPanel ───────────────────────────────────────────────────────────

function InspectorPanel(props: {
  doc: Document;
  issues: ValidationIssue[];
  selectedId: NodeId;
  mode: Mode;
  breakpoint: Breakpoint;
  dispatch: (action: EditorAction, opts?: DispatchOptions) => void;
}) {
  const node = props.doc.nodes[props.selectedId];
  if (!node) return null;

  const def = blockRegistry[node.type];
  const locked = Boolean(node.constraints?.locked);
  const disabled = locked || props.mode === "preview";

  const nodeProps = node.props as Record<string, unknown>;
  const nodeStyle = node.style;
  const nodeIssues = props.issues.filter((i) => i.nodeId === node.id);
  const errorCount = props.issues.filter((i) => i.level === "error").length;
  const warningCount = props.issues.length - errorCount;

  // Section expansion state — initialized based on active values
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    const initial = new Set<string>(["content"]);
    if (TYPOGRAPHY_TYPES.includes(node.type)) initial.add("typography");
    if (hasAnyStyleValue(nodeStyle, LAYOUT_STYLE_KEYS)) initial.add("layout");
    if (hasAnyStyleValue(nodeStyle, SPACING_STYLE_KEYS)) initial.add("spacing");
    if (hasAnyStyleValue(nodeStyle, APPEARANCE_STYLE_KEYS)) initial.add("appearance");
    if (node.constraints?.locked || node.constraints?.hidden) initial.add("constraints");
    return initial;
  });

  const toggle = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Dispatch helpers
  const patchProps = (patch: Record<string, unknown>, keyForCoalesce: string) => {
    props.dispatch(
      { type: "UPDATE_PROPS", nodeId: node.id, patch },
      { coalesceKey: `props:${node.id}:${keyForCoalesce}`, historyLabel: "Edit" },
    );
  };

  const patchStyle = (patch: Partial<StyleProps>, keyForCoalesce: string) => {
    props.dispatch(
      { type: "UPDATE_STYLE", nodeId: node.id, breakpoint: props.breakpoint, patch },
      { coalesceKey: `style:${node.id}:${props.breakpoint}:${keyForCoalesce}`, historyLabel: "Style" },
    );
  };

  const patchConstraints = (patch: Partial<import("@/editor-core").NodeConstraints>) => {
    props.dispatch({ type: "UPDATE_CONSTRAINTS", nodeId: node.id, patch }, { historyLabel: "Constraints" });
  };

  const resetBreakpoint = () => {
    props.dispatch(
      { type: "RESET_STYLE_BREAKPOINT", nodeId: node.id, breakpoint: props.breakpoint },
      { historyLabel: "Reset styles" },
    );
  };

  const showLayout = LAYOUT_TYPES.includes(node.type);
  const showSpacing = SPACING_TYPES.includes(node.type);
  const showTypography = TYPOGRAPHY_TYPES.includes(node.type);
  const showAppearance = APPEARANCE_TYPES.includes(node.type);

  const hasLayoutOverride = hasAnyStyleValue(nodeStyle, LAYOUT_STYLE_KEYS);
  const hasSpacingOverride = hasAnyStyleValue(nodeStyle, SPACING_STYLE_KEYS);
  const hasTypographyOverride = hasAnyStyleValue(nodeStyle, TYPOGRAPHY_STYLE_KEYS);
  const hasAppearanceOverride = hasAnyStyleValue(nodeStyle, APPEARANCE_STYLE_KEYS);
  const hasConstraintsOverride = Boolean(node.constraints?.locked || node.constraints?.hidden);
  const hasContentOverride = hasContentOverrides({ type: node.type, props: nodeProps });

  const canResetBreakpoint =
    props.breakpoint === "base"
      ? Boolean(nodeStyle && Object.keys(nodeStyle.base ?? {}).length > 0)
      : Boolean(nodeStyle?.[props.breakpoint] && Object.keys(nodeStyle[props.breakpoint] ?? {}).length > 0);

  return (
    <div className={styles.inspector}>
      {/* Type switcher header */}
      <TypeSwitcher
        type={node.type}
        nodeProps={nodeProps}
        locked={locked}
        hidden={Boolean(node.constraints?.hidden)}
        disabled={disabled}
        onPatchProps={patchProps}
      />

      {props.mode === "preview" ? (
        <div className={styles.inlineNotice} role="note">
          Preview mode is read-only. Switch to Edit to make changes.
        </div>
      ) : null}

      {/* Breakpoint row */}
      <div className={styles.inlineRow}>
        <div className={styles.muted} style={{ margin: 0 }}>
          Breakpoint: <strong>{props.breakpoint.toUpperCase()}</strong>
        </div>
        <button
          type="button"
          className={styles.resetButton}
          disabled={disabled || !canResetBreakpoint}
          onClick={resetBreakpoint}
        >
          Reset bp
        </button>
      </div>

      {/* Content section */}
      {def.inspector ? (
        <CollapsibleSection
          label="Content"
          sectionKey="content"
          expanded={expandedSections.has("content")}
          hasOverrides={hasContentOverride}
          onToggle={toggle}
        >
          <ContentSection
            node={node}
            disabled={disabled}
            nodeIssues={nodeIssues}
            onPatchProps={patchProps}
            onResetProp={(propKey) => {
              const defaultValue = (def.defaultProps as Record<string, unknown>)[propKey];
              props.dispatch({ type: "UPDATE_PROPS", nodeId: node.id, patch: { [propKey]: defaultValue } }, { historyLabel: "Reset" });
            }}
          />
        </CollapsibleSection>
      ) : null}

      {/* Layout section */}
      {showLayout ? (
        <CollapsibleSection
          label="Layout"
          sectionKey="layout"
          expanded={expandedSections.has("layout")}
          hasOverrides={hasLayoutOverride}
          onToggle={toggle}
        >
          <StyleFieldGroup
            fields={[
              { key: "display", label: "Display", kind: "select", options: ["", "block", "flex"] },
              { key: "flexDirection", label: "Direction", kind: "select", options: ["", "row", "column"] },
              { key: "justifyContent", label: "Justify", kind: "select", options: ["", "flex-start", "center", "flex-end", "space-between"] },
              { key: "alignItems", label: "Align", kind: "select", options: ["", "stretch", "flex-start", "center", "flex-end"] },
              { key: "gap", label: "Gap", kind: "length", tokens: getSpacingTokens().map((t) => t.value) },
            ]}
            nodeStyle={nodeStyle}
            breakpoint={props.breakpoint}
            disabled={disabled}
            onPatchStyle={patchStyle}
          />
        </CollapsibleSection>
      ) : null}

      {/* Spacing section (box model) */}
      {showSpacing ? (
        <CollapsibleSection
          label="Spacing"
          sectionKey="spacing"
          expanded={expandedSections.has("spacing")}
          hasOverrides={hasSpacingOverride}
          onToggle={toggle}
        >
          <SpacingSection
            nodeStyle={nodeStyle}
            breakpoint={props.breakpoint}
            blockLabel={def.label}
            disabled={disabled}
            onPatchStyle={patchStyle}
          />
        </CollapsibleSection>
      ) : null}

      {/* Typography section */}
      {showTypography ? (
        <CollapsibleSection
          label="Typography"
          sectionKey="typography"
          expanded={expandedSections.has("typography")}
          hasOverrides={hasTypographyOverride}
          onToggle={toggle}
        >
          <StyleFieldGroup
            fields={[
              { key: "fontFamily", label: "Font family", kind: "text", tokens: FONT_FAMILY_TOKENS.map((t) => t.value) },
              { key: "fontSize", label: "Font size", kind: "text", tokens: FONT_SIZE_TOKENS.map((t) => t.value) },
              { key: "fontWeight", label: "Font weight", kind: "text" },
              { key: "lineHeight", label: "Line height", kind: "text" },
              { key: "textAlign", label: "Align", kind: "select", options: ["", "left", "center", "right"] },
              { key: "color", label: "Color", kind: "color", tokens: COLOR_TOKENS.map((t) => t.value) },
            ]}
            nodeStyle={nodeStyle}
            breakpoint={props.breakpoint}
            disabled={disabled}
            onPatchStyle={patchStyle}
          />
        </CollapsibleSection>
      ) : null}

      {/* Appearance section */}
      {showAppearance ? (
        <CollapsibleSection
          label="Appearance"
          sectionKey="appearance"
          expanded={expandedSections.has("appearance")}
          hasOverrides={hasAppearanceOverride}
          onToggle={toggle}
        >
          <StyleFieldGroup
            fields={[
              { key: "backgroundColor", label: "Background", kind: "color", tokens: COLOR_TOKENS.map((t) => t.value) },
              { key: "borderRadius", label: "Radius", kind: "length" },
              { key: "border", label: "Border", kind: "text" },
              { key: "boxShadow", label: "Shadow", kind: "text" },
              { key: "opacity", label: "Opacity", kind: "number" },
            ]}
            nodeStyle={nodeStyle}
            breakpoint={props.breakpoint}
            disabled={disabled}
            onPatchStyle={patchStyle}
          />
        </CollapsibleSection>
      ) : null}

      {/* Constraints section */}
      <CollapsibleSection
        label="Constraints"
        sectionKey="constraints"
        expanded={expandedSections.has("constraints")}
        hasOverrides={hasConstraintsOverride}
        onToggle={toggle}
      >
        <ConstraintsSection
          locked={Boolean(node.constraints?.locked)}
          hidden={Boolean(node.constraints?.hidden)}
          disabled={props.mode === "preview"}
          onPatch={patchConstraints}
        />
      </CollapsibleSection>

      {/* Issues panel */}
      <details className={styles.issuesPanel} open={errorCount > 0}>
        <summary className={styles.issuesSummary}>
          Issues ({errorCount} errors, {warningCount} warnings)
        </summary>
        <div className={styles.issuesBody}>
          {props.issues.length === 0 ? (
            <div className={styles.muted}>No issues.</div>
          ) : (
            <ul className={styles.issueList}>
              {props.issues
                .slice()
                .sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1))
                .map((issue, idx) => {
                  const issueNode = props.doc.nodes[issue.nodeId];
                  const label = issueNode ? blockRegistry[issueNode.type].label : "Missing node";
                  return (
                    <li key={`${issue.nodeId}:${idx}`} className={styles.issueItem}>
                      <button
                        type="button"
                        className={styles.issueButton}
                        onClick={() => props.dispatch({ type: "SET_SELECTED", nodeId: issue.nodeId })}
                      >
                        <span className={issue.level === "error" ? styles.issueLevelError : styles.issueLevelWarning}>
                          {issue.level.toUpperCase()}
                        </span>
                        <span className={styles.issueText}>
                          <span className={styles.issueNode}>{label}</span>: {issue.message}
                          {issue.fieldPath ? <span className={styles.issuePath}> ({issue.fieldPath})</span> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}

// ─── TypeSwitcher ─────────────────────────────────────────────────────────────

function TypeSwitcher(props: {
  type: NodeType;
  nodeProps: Record<string, unknown>;
  locked: boolean;
  hidden: boolean;
  disabled: boolean;
  onPatchProps: (patch: Record<string, unknown>, key: string) => void;
}) {
  const def = blockRegistry[props.type];
  const variantKey = getVariantPropKey(props.type);
  const variantOptions = getVariantOptions(props.type);
  const currentVariant = variantKey ? String(props.nodeProps[variantKey] ?? "") : null;

  const typeLabel = variantKey && currentVariant ? `${def.label} — ${currentVariant}` : def.label;

  return (
    <div className={styles.typeSwitcher}>
      <div className={styles.typeSwitcherLeft}>
        <span className={styles.typeSwitcherLabel}>{typeLabel}</span>
        <span className={styles.typeSwitcherMeta}>{props.locked ? "Locked" : props.hidden ? "Hidden" : ""}</span>
      </div>
      {variantOptions && variantKey ? (
        <select
          className={styles.typeSwitcherSelect}
          value={currentVariant ?? ""}
          disabled={props.disabled}
          aria-label={`Switch ${def.label} variant`}
          onChange={(e) => {
            props.onPatchProps({ [variantKey]: e.target.value }, variantKey);
          }}
        >
          {variantOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

// ─── CollapsibleSection ───────────────────────────────────────────────────────

function CollapsibleSection(props: {
  label: string;
  sectionKey: string;
  expanded: boolean;
  hasOverrides: boolean;
  onToggle: (key: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.inspectorCollapsible}>
      <button
        type="button"
        className={styles.sectionHeader}
        onClick={() => props.onToggle(props.sectionKey)}
        aria-expanded={props.expanded}
      >
        <span className={styles.sectionChevron} aria-hidden="true">
          {props.expanded ? "▾" : "▸"}
        </span>
        <span className={styles.sectionLabel}>{props.label}</span>
        {props.hasOverrides ? <span className={styles.sectionOverrideDot} aria-hidden="true" /> : null}
      </button>
      {props.expanded ? (
        <div className={styles.sectionBody} role="region" aria-label={props.label}>
          {props.children}
        </div>
      ) : null}
    </div>
  );
}

// ─── ContentSection ───────────────────────────────────────────────────────────

function ContentSection(props: {
  node: { id: NodeId; type: NodeType; props: Record<string, unknown> };
  disabled: boolean;
  nodeIssues: ValidationIssue[];
  onPatchProps: (patch: Record<string, unknown>, keyForCoalesce: string) => void;
  onResetProp: (propKey: string) => void;
}) {
  const schema = blockRegistry[props.node.type].inspector;
  if (!schema) return <p className={styles.muted}>No inspector schema defined.</p>;

  return (
    <div className={styles.groupBody}>
      {schema.groups.map((g) => (
        <Fragment key={g.label}>
          {schema.groups.length > 1 ? <div className={styles.subGroupLabel}>{g.label}</div> : null}
          {g.fields.map((field) => (
            <Fragment key={field.path}>
              <InspectorPropField
                nodeProps={props.node.props}
                field={field}
                disabled={props.disabled}
                issues={props.nodeIssues.filter((i) => i.fieldPath === field.path)}
                onChange={(value) => {
                  const key = propKeyFromPath(field.path);
                  if (!key) return;
                  props.onPatchProps({ [key]: value }, key);
                }}
                onReset={() => {
                  const key = propKeyFromPath(field.path);
                  if (!key) return;
                  props.onResetProp(key);
                }}
              />
            </Fragment>
          ))}
        </Fragment>
      ))}
    </div>
  );
}

// ─── SpacingSection ───────────────────────────────────────────────────────────

function SpacingSection(props: {
  nodeStyle: import("@/editor-core").Responsive<StyleProps> | undefined;
  breakpoint: Breakpoint;
  blockLabel: string;
  disabled: boolean;
  onPatchStyle: (patch: Partial<StyleProps>, key: string) => void;
}) {
  const style = props.nodeStyle;
  const base = style?.base ?? {};
  const bpOverride = props.breakpoint === "base" ? {} : (style?.[props.breakpoint] ?? {});
  const effective = { ...base, ...bpOverride } as Record<keyof StyleProps, string | undefined>;

  return (
    <div className={styles.groupBody}>
      <BoxModelEditor
        paddingTop={effective.paddingTop}
        paddingRight={effective.paddingRight}
        paddingBottom={effective.paddingBottom}
        paddingLeft={effective.paddingLeft}
        marginTop={effective.marginTop}
        marginRight={effective.marginRight}
        marginBottom={effective.marginBottom}
        marginLeft={effective.marginLeft}
        blockLabel={props.blockLabel}
        disabled={props.disabled}
        onPatchStyle={(patch) => {
          const keys = Object.keys(patch).join(",");
          props.onPatchStyle(patch, keys);
        }}
      />
      {/* Also expose shorthand padding/margin fields for convenience */}
      <StyleFieldGroup
        fields={[
          { key: "padding", label: "Padding (shorthand)", kind: "length", tokens: getSpacingTokens().map((t) => t.value) },
          { key: "margin", label: "Margin (shorthand)", kind: "length", tokens: getSpacingTokens().map((t) => t.value) },
          { key: "width", label: "Width", kind: "length" },
          { key: "maxWidth", label: "Max width", kind: "length" },
          { key: "minHeight", label: "Min height", kind: "length" },
        ]}
        nodeStyle={props.nodeStyle}
        breakpoint={props.breakpoint}
        disabled={props.disabled}
        onPatchStyle={props.onPatchStyle}
      />
    </div>
  );
}

// ─── ConstraintsSection ───────────────────────────────────────────────────────

function ConstraintsSection(props: {
  locked: boolean;
  hidden: boolean;
  disabled: boolean;
  onPatch: (patch: Partial<import("@/editor-core").NodeConstraints>) => void;
}) {
  return (
    <div className={styles.groupBody}>
      <div className={styles.fieldRow}>
        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            checked={props.locked}
            disabled={props.disabled}
            onChange={(e) => props.onPatch({ locked: e.target.checked })}
          />
          <span className={styles.toggleLabel}>Locked</span>
        </label>
      </div>
      <div className={styles.fieldRow}>
        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            checked={props.hidden}
            disabled={props.disabled}
            onChange={(e) => props.onPatch({ hidden: e.target.checked })}
          />
          <span className={styles.toggleLabel}>Hidden</span>
        </label>
      </div>
    </div>
  );
}

// ─── StyleFieldGroup ──────────────────────────────────────────────────────────

function StyleFieldGroup(props: {
  fields: Array<
    | { key: keyof StyleProps; label: string; kind: "length" | "text" | "color"; tokens?: string[] }
    | { key: keyof StyleProps; label: string; kind: "select"; options: string[] }
    | { key: keyof StyleProps; label: string; kind: "number" }
  >;
  nodeStyle: import("@/editor-core").Responsive<StyleProps> | undefined;
  breakpoint: Breakpoint;
  disabled: boolean;
  onPatchStyle: (patch: Partial<StyleProps>, keyForCoalesce: string) => void;
}) {
  return (
    <div className={styles.groupBody}>
      {props.fields.map((f) => (
        <StyleField
          key={String(f.key)}
          nodeStyle={props.nodeStyle}
          breakpoint={props.breakpoint}
          disabled={props.disabled}
          field={f as never}
          onPatchStyle={props.onPatchStyle}
        />
      ))}
    </div>
  );
}

// ─── StyleField ───────────────────────────────────────────────────────────────

function StyleField(props: {
  nodeStyle: import("@/editor-core").Responsive<StyleProps> | undefined;
  breakpoint: Breakpoint;
  disabled: boolean;
  field:
    | { key: keyof StyleProps; label: string; kind: "length" | "text" | "color"; tokens?: string[] }
    | { key: keyof StyleProps; label: string; kind: "select"; options: string[] }
    | { key: keyof StyleProps; label: string; kind: "number" };
  onPatchStyle: (patch: Partial<StyleProps>, keyForCoalesce: string) => void;
}) {
  const style = props.nodeStyle;
  const key = props.field.key;

  const overridden = isStyleKeyOverridden(style, props.breakpoint, key);
  const effective = getEffectiveStyleValue(style, props.breakpoint, key);
  const inherited = getInheritedStyleValue(style, props.breakpoint, key);

  const bucket = props.breakpoint === "base" ? style?.base : style?.[props.breakpoint];
  const bucketValue = bucket ? (bucket as Record<string, unknown>)[key as string] : undefined;

  const resetDisabled = props.disabled || !overridden;
  const inheritedText = inherited === undefined ? "" : String(inherited);
  const fieldId = `style_${props.breakpoint}_${String(key)}`;

  // Responsive override badges: show which non-base breakpoints have this key set
  const bpBadges = (["sm", "md", "lg"] as const).filter((bp) => isStyleKeyOverridden(style, bp, key));

  const onReset = () => {
    props.onPatchStyle({ [key]: undefined } as Partial<StyleProps>, String(key));
  };

  const onChangeText = (value: string) => {
    props.onPatchStyle({ [key]: value.trim() ? value : undefined } as Partial<StyleProps>, String(key));
  };

  const onChangeNumber = (value: string) => {
    if (!value.trim()) {
      props.onPatchStyle({ [key]: undefined } as Partial<StyleProps>, String(key));
      return;
    }
    const num = Number(value);
    props.onPatchStyle({ [key]: Number.isFinite(num) ? num : undefined } as Partial<StyleProps>, String(key));
  };

  return (
    <div className={styles.fieldRow}>
      <div className={styles.fieldHeader}>
        <div className={styles.fieldLabelRow}>
          <span className={styles.fieldLabel}>{props.field.label}</span>
          {overridden ? (
            <span className={styles.badgeSmall}>Override</span>
          ) : inheritedText ? (
            <span className={styles.badgeSmall}>Inherited</span>
          ) : null}
          {bpBadges.map((bp) => (
            <span key={bp} className={styles.bpBadge}>
              {bp.toUpperCase()}
            </span>
          ))}
        </div>
        <button type="button" className={styles.resetButton} disabled={resetDisabled} onClick={onReset}>
          Reset
        </button>
      </div>

      {props.field.kind === "select" ? (
        <select
          disabled={props.disabled}
          value={typeof effective === "string" ? effective : ""}
          onChange={(e) => {
            const v = e.target.value;
            props.onPatchStyle({ [key]: v ? v : undefined } as Partial<StyleProps>, String(key));
          }}
        >
          {props.field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt || "Unset"}
            </option>
          ))}
        </select>
      ) : null}

      {props.field.kind === "number" ? (
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={1}
          step={0.05}
          disabled={props.disabled}
          value={bucketValue === undefined || bucketValue === null ? "" : String(bucketValue)}
          placeholder={typeof effective === "number" ? String(effective) : ""}
          onChange={(e) => onChangeNumber(e.target.value)}
        />
      ) : null}

      {props.field.kind === "text" ? (
        <TokenTextField
          id={fieldId}
          disabled={props.disabled}
          value={bucketValue === undefined || bucketValue === null ? "" : String(bucketValue)}
          placeholder={typeof effective === "string" ? String(effective) : ""}
          tokens={"tokens" in props.field ? props.field.tokens : undefined}
          onChange={onChangeText}
        />
      ) : null}

      {props.field.kind === "length" ? (
        <TokenTextField
          id={fieldId}
          disabled={props.disabled}
          value={typeof bucketValue === "string" ? bucketValue : ""}
          placeholder={typeof effective === "string" ? String(effective) : inheritedText}
          tokens={"tokens" in props.field ? props.field.tokens : undefined}
          onChange={onChangeText}
        />
      ) : null}

      {props.field.kind === "color" ? (
        <TokenTextField
          id={fieldId}
          disabled={props.disabled}
          value={typeof bucketValue === "string" ? bucketValue : ""}
          placeholder={typeof effective === "string" ? String(effective) : inheritedText}
          tokens={"tokens" in props.field ? props.field.tokens : undefined}
          onChange={onChangeText}
        />
      ) : null}

      {!overridden && inheritedText ? <div className={styles.fieldHelp}>Inherited: {inheritedText}</div> : null}
    </div>
  );
}

// ─── InspectorPropField ───────────────────────────────────────────────────────

function InspectorPropField(props: {
  nodeProps: Record<string, unknown>;
  field: {
    kind: "text" | "number" | "select" | "color" | "length" | "toggle" | "info" | "options-list" | "icon-picker";
    path: string;
    label: string;
    min?: number;
    max?: number;
    step?: number;
    placeholder?: string;
    required?: boolean;
    message?: string;
    options?: { label: string; value: string }[];
    tokens?: string[];
  };
  disabled: boolean;
  issues: ValidationIssue[];
  onChange: (value: unknown) => void;
  onReset: () => void;
}) {
  const key = propKeyFromPath(props.field.path);
  const rawValue = key ? props.nodeProps[key] : undefined;

  if (props.field.kind === "info") {
    return (
      <div className={styles.fieldRow}>
        <div className={styles.fieldLabel}>{props.field.label}</div>
        <div className={styles.muted}>{props.field.message ?? ""}</div>
      </div>
    );
  }

  if (props.field.kind === "options-list") {
    const optionsList = Array.isArray(rawValue)
      ? (rawValue as { label: string; value: string }[])
      : [];
    return (
      <OptionsListField
        label={props.field.label}
        options={optionsList}
        disabled={props.disabled}
        issues={props.issues}
        onChange={props.onChange}
      />
    );
  }

  if (props.field.kind === "icon-picker") {
    return (
      <IconPickerField
        label={props.field.label}
        value={typeof rawValue === "string" ? rawValue : "star"}
        disabled={props.disabled}
        onChange={props.onChange}
      />
    );
  }

  const common = {
    id: `field_${props.field.path}`,
    disabled: props.disabled,
    "aria-invalid": props.issues.some((i) => i.level === "error") || undefined,
  } as const;

  const resetDisabled = props.disabled || !key;

  return (
    <div className={styles.fieldRow}>
      <div className={styles.fieldHeader}>
        <label className={styles.fieldLabel} htmlFor={common.id}>
          {props.field.label}
          {props.field.required ? <span className={styles.required}>*</span> : null}
        </label>
        <button type="button" className={styles.resetButton} disabled={resetDisabled} onClick={props.onReset}>
          Reset
        </button>
      </div>

      {props.field.kind === "toggle" ? (
        <label className={styles.toggleRow}>
          <input {...common} type="checkbox" checked={Boolean(rawValue)} onChange={(e) => props.onChange(e.target.checked)} />
          <span className={styles.toggleLabel}>Enabled</span>
        </label>
      ) : null}

      {props.field.kind === "select" ? (
        <select {...common} value={typeof rawValue === "string" ? rawValue : ""} onChange={(e) => props.onChange(e.target.value)}>
          {(props.field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : null}

      {props.field.kind === "text" ? (
        <input
          {...common}
          type={typeof rawValue === "number" ? "number" : "text"}
          value={rawValue === undefined || rawValue === null ? "" : String(rawValue)}
          placeholder={props.field.placeholder}
          onChange={(e) => props.onChange(e.target.value)}
        />
      ) : null}

      {props.field.kind === "number" ? (
        <input
          {...common}
          type="number"
          inputMode="numeric"
          min={typeof props.field.min === "number" ? props.field.min : undefined}
          max={typeof props.field.max === "number" ? props.field.max : undefined}
          step={typeof props.field.step === "number" ? props.field.step : undefined}
          value={typeof rawValue === "number" ? String(rawValue) : typeof rawValue === "string" ? rawValue : ""}
          placeholder={props.field.placeholder}
          onChange={(e) => {
            const nextRaw = e.target.value;
            if (!nextRaw.trim()) {
              if (props.field.required) return;
              props.onChange(undefined);
              return;
            }
            const nextNum = Number(nextRaw);
            if (!Number.isFinite(nextNum)) return;
            let clamped = nextNum;
            if (typeof props.field.min === "number") clamped = Math.max(props.field.min, clamped);
            if (typeof props.field.max === "number") clamped = Math.min(props.field.max, clamped);
            if (props.field.step === 1) clamped = Math.trunc(clamped);
            props.onChange(clamped);
          }}
        />
      ) : null}

      {props.field.kind === "length" ? (
        <TokenTextField
          {...common}
          value={typeof rawValue === "string" ? rawValue : ""}
          placeholder={props.field.placeholder}
          tokens={[...(props.field.tokens ?? []), ...getSpacingTokens().map((t) => t.value)]}
          onChange={(v) => props.onChange(v)}
        />
      ) : null}

      {props.field.kind === "color" ? (
        <TokenTextField
          {...common}
          value={typeof rawValue === "string" ? rawValue : ""}
          placeholder={props.field.placeholder}
          tokens={COLOR_TOKENS.map((t) => t.value)}
          onChange={(v) => props.onChange(v)}
        />
      ) : null}

      {props.issues.length > 0 ? (
        <div className={styles.fieldIssues} role="alert">
          {props.issues.map((i, idx) => (
            <div key={idx} className={i.level === "error" ? styles.issueError : styles.issueWarning}>
              {i.message}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── IconPickerField ──────────────────────────────────────────────────────────

function IconPickerField(props: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const [filter, setFilter] = useState("");
  const filtered = filter.trim()
    ? ICON_NAMES.filter((n) => n.includes(filter.trim().toLowerCase()))
    : ICON_NAMES;

  return (
    <div className={styles.fieldRow}>
      <div className={styles.fieldHeader}>
        <span className={styles.fieldLabel}>{props.label}</span>
        <span className={styles.badgeSmall}>{props.value}</span>
      </div>
      <input
        type="text"
        placeholder="Filter icons…"
        value={filter}
        disabled={props.disabled}
        aria-label="Filter icons"
        onChange={(e) => setFilter(e.target.value)}
        style={{ marginBottom: "4px" }}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: "2px",
          maxHeight: "160px",
          overflowY: "auto",
          border: "1px solid var(--editor-border)",
          borderRadius: "4px",
          padding: "4px",
          background: "var(--editor-surface)",
        }}
      >
        {filtered.map((name) => {
          const paths = ICON_DATA[name] ?? "";
          const isSelected = props.value === name;
          return (
            <button
              key={name}
              type="button"
              title={name}
              aria-label={name}
              aria-pressed={isSelected}
              disabled={props.disabled}
              onClick={() => props.onChange(name)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "4px",
                border: isSelected ? "2px solid var(--editor-accent)" : "2px solid transparent",
                borderRadius: "4px",
                background: isSelected ? "var(--editor-accent-muted)" : "transparent",
                cursor: "pointer",
                lineHeight: 0,
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                // Safe: bundled icon data, not user input
                dangerouslySetInnerHTML={{ __html: paths }}
              />
            </button>
          );
        })}
        {filtered.length === 0 ? (
          <div
            style={{
              gridColumn: "1 / -1",
              padding: "8px",
              textAlign: "center",
              color: "var(--editor-text-muted)",
              fontSize: "11px",
            }}
          >
            No icons match "{filter}"
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── OptionsListField ─────────────────────────────────────────────────────────

function OptionsListField(props: {
  label: string;
  options: { label: string; value: string }[];
  disabled: boolean;
  issues: ValidationIssue[];
  onChange: (value: unknown) => void;
}) {
  const addOption = () => {
    const next = [...props.options, { label: `Option ${props.options.length + 1}`, value: `option-${props.options.length + 1}` }];
    props.onChange(next);
  };

  const removeOption = (index: number) => {
    const next = props.options.filter((_, i) => i !== index);
    props.onChange(next);
  };

  const updateOption = (index: number, field: "label" | "value", newVal: string) => {
    const next = props.options.map((opt, i) => (i === index ? { ...opt, [field]: newVal } : opt));
    props.onChange(next);
  };

  return (
    <div className={styles.fieldRow}>
      <div className={styles.fieldHeader}>
        <span className={styles.fieldLabel}>{props.label}</span>
        <button type="button" className={styles.resetButton} disabled={props.disabled} onClick={addOption}>
          + Add
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {props.options.map((opt, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "4px", alignItems: "center" }}>
            <input
              type="text"
              value={opt.label}
              placeholder="Label"
              disabled={props.disabled}
              aria-label={`Option ${i + 1} label`}
              onChange={(e) => updateOption(i, "label", e.target.value)}
            />
            <input
              type="text"
              value={opt.value}
              placeholder="Value"
              disabled={props.disabled}
              aria-label={`Option ${i + 1} value`}
              onChange={(e) => updateOption(i, "value", e.target.value)}
            />
            <button
              type="button"
              className={styles.resetButton}
              disabled={props.disabled}
              aria-label={`Remove option ${i + 1}`}
              onClick={() => removeOption(i)}
            >
              ✕
            </button>
          </div>
        ))}
        {props.options.length === 0 ? (
          <div className={styles.muted} style={{ fontSize: "11px" }}>No options. Click + Add to add one.</div>
        ) : null}
      </div>
      {props.issues.length > 0 ? (
        <div className={styles.fieldIssues} role="alert">
          {props.issues.map((issue, idx) => (
            <div key={idx} className={issue.level === "error" ? styles.issueError : styles.issueWarning}>
              {issue.message}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── TokenTextField ───────────────────────────────────────────────────────────

function TokenTextField(props: {
  id?: string;
  disabled?: boolean;
  value: string;
  placeholder?: string;
  tokens?: string[];
  onChange: (value: string) => void;
  "aria-invalid"?: boolean | undefined;
}) {
  const tokens = props.tokens?.length ? Array.from(new Set(props.tokens)) : undefined;
  const datalistId = tokens?.length ? `${props.id ?? "token"}_tokens` : undefined;

  return (
    <div className={styles.tokenField}>
      {tokens?.length ? (
        <select
          className={styles.tokenSelect}
          disabled={props.disabled}
          value=""
          aria-label="Tokens"
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            props.onChange(v);
          }}
        >
          <option value="">Tokens</option>
          {tokens.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      ) : null}

      <input
        id={props.id}
        className={styles.tokenInput}
        disabled={props.disabled}
        value={props.value}
        placeholder={props.placeholder}
        list={datalistId}
        aria-invalid={props["aria-invalid"]}
        onChange={(e: ChangeEvent<HTMLInputElement>) => props.onChange(e.target.value)}
      />

      {datalistId ? (
        <datalist id={datalistId}>
          {tokens?.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function propKeyFromPath(path: string): string | null {
  if (!path.startsWith("props.")) return null;
  const key = path.slice("props.".length);
  if (!key) return null;
  if (key.includes(".")) return null;
  return key;
}
