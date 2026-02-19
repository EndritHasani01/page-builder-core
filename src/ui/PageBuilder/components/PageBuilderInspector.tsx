import type { ChangeEvent } from "react";
import { Fragment } from "react";

import type { Breakpoint, Document, NodeId, NodeType, StyleProps, ValidationIssue } from "@/editor-core";
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

export function PageBuilderInspector(props: { tab: "content" | "style"; onTabChange: (tab: "content" | "style") => void }) {
  const doc = useEditorStore((s) => s.doc);
  const issues = useEditorStore((s) => s.issues);
  const selectedId = useEditorStore((s) => s.selectedId);
  const mode = useEditorStore((s) => s.mode);
  const breakpoint = useEditorStore((s) => s.breakpoint);
  const dispatch = useEditorStore((s) => s.dispatch);

  return (
    <InspectorPanel
      doc={doc}
      issues={issues}
      selectedId={selectedId}
      mode={mode}
      breakpoint={breakpoint}
      tab={props.tab}
      onTabChange={props.onTabChange}
      dispatch={dispatch}
    />
  );
}

function InspectorPanel(props: {
  doc: Document;
  issues: ValidationIssue[];
  selectedId: NodeId | null;
  mode: Mode;
  breakpoint: Breakpoint;
  tab: "content" | "style";
  onTabChange: (tab: "content" | "style") => void;
  dispatch: (action: EditorAction, opts?: DispatchOptions) => void;
}) {
  const node = props.selectedId ? props.doc.nodes[props.selectedId] : undefined;
  if (!node) {
    return <p className={styles.muted}>Select a node to edit.</p>;
  }

  const def = blockRegistry[node.type];
  const locked = Boolean(node.constraints?.locked);
  const disabled = locked || props.mode === "preview";

  const nodeIssues = props.issues.filter((i) => i.nodeId === node.id);
  const errorCount = props.issues.filter((i) => i.level === "error").length;
  const warningCount = props.issues.length - errorCount;

  return (
    <div className={styles.inspector}>
      <div className={styles.inspectorHeader}>
        <div className={styles.inspectorTitleRow}>
          <div className={styles.inspectorNodeLabel}>{def.label}</div>
          {locked ? <span className={styles.badge}>Locked</span> : null}
          {node.constraints?.hidden ? <span className={styles.badge}>Hidden</span> : null}
        </div>
        <div className={styles.inspectorNodeMeta}>{node.id}</div>
      </div>

      <div className={styles.tabList} role="tablist" aria-label="Inspector tabs">
        <button
          type="button"
          role="tab"
          aria-selected={props.tab === "content"}
          className={props.tab === "content" ? styles.tabButtonActive : styles.tabButton}
          onClick={() => props.onTabChange("content")}
        >
          Content
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={props.tab === "style"}
          className={props.tab === "style" ? styles.tabButtonActive : styles.tabButton}
          onClick={() => props.onTabChange("style")}
        >
          Style
        </button>
      </div>

      {props.mode === "preview" ? (
        <div className={styles.inlineNotice} role="note">
          Preview mode is read-only. Switch to Edit to make changes.
        </div>
      ) : null}

      {props.tab === "content" ? (
        <InspectorContent
          node={node}
          disabled={disabled}
          nodeIssues={nodeIssues}
          onPatchProps={(patch, keyForCoalesce) =>
            props.dispatch(
              { type: "UPDATE_PROPS", nodeId: node.id, patch },
              { coalesceKey: `props:${node.id}:${keyForCoalesce}`, historyLabel: "Edit" },
            )
          }
          onResetProp={(propKey) => {
            const defaultValue = (def.defaultProps as Record<string, unknown>)[propKey];
            props.dispatch({ type: "UPDATE_PROPS", nodeId: node.id, patch: { [propKey]: defaultValue } }, { historyLabel: "Reset" });
          }}
        />
      ) : null}

      {props.tab === "style" ? (
        <InspectorStyle
          node={node}
          disabled={disabled}
          nodeIssues={nodeIssues}
          breakpoint={props.breakpoint}
          onPatchStyle={(patch, keyForCoalesce) =>
            props.dispatch(
              { type: "UPDATE_STYLE", nodeId: node.id, breakpoint: props.breakpoint, patch },
              { coalesceKey: `style:${node.id}:${props.breakpoint}:${keyForCoalesce}`, historyLabel: "Style" },
            )
          }
          onResetBreakpoint={() => {
            props.dispatch(
              { type: "RESET_STYLE_BREAKPOINT", nodeId: node.id, breakpoint: props.breakpoint },
              { historyLabel: "Reset styles" },
            );
          }}
        />
      ) : null}

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

function InspectorContent(props: {
  node: { id: NodeId; type: NodeType; props: Record<string, unknown> };
  disabled: boolean;
  nodeIssues: ValidationIssue[];
  onPatchProps: (patch: Record<string, unknown>, keyForCoalesce: string) => void;
  onResetProp: (propKey: string) => void;
}) {
  const schema = blockRegistry[props.node.type].inspector;
  if (!schema) return <p className={styles.muted}>No inspector schema defined.</p>;

  const groups = schema.groups;
  return (
    <div className={styles.inspectorSection} role="tabpanel" aria-label="Content">
      {groups.map((g) => (
        <div key={g.label} className={styles.group}>
          <div className={styles.groupHeader}>{g.label}</div>
          <div className={styles.groupBody}>
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
          </div>
        </div>
      ))}
    </div>
  );
}

function InspectorPropField(props: {
  nodeProps: Record<string, unknown>;
  field: {
    kind: "text" | "select" | "color" | "length" | "toggle";
    path: string;
    label: string;
    placeholder?: string;
    required?: boolean;
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

function InspectorStyle(props: {
  node: { id: NodeId; style?: unknown };
  disabled: boolean;
  nodeIssues: ValidationIssue[];
  breakpoint: Breakpoint;
  onPatchStyle: (patch: Partial<StyleProps>, keyForCoalesce: string) => void;
  onResetBreakpoint: () => void;
}) {
  const node = props.node as unknown as { id: NodeId; style?: import("@/editor-core").Responsive<StyleProps> };
  const style = node.style;

  const bpBucket = props.breakpoint === "base" ? style?.base : style?.[props.breakpoint];

  const canResetBreakpoint =
    props.breakpoint === "base"
      ? Boolean(style && Object.keys(style.base ?? {}).length > 0)
      : Boolean(bpBucket && Object.keys(bpBucket).length > 0);

  return (
    <div className={styles.inspectorSection} role="tabpanel" aria-label="Style">
      <div className={styles.inlineRow}>
        <div className={styles.muted}>Editing: {props.breakpoint.toUpperCase()}</div>
        <button
          type="button"
          className={styles.resetButton}
          disabled={props.disabled || !canResetBreakpoint}
          onClick={props.onResetBreakpoint}
        >
          Reset breakpoint
        </button>
      </div>

      <StyleGroup
        label="Layout"
        fields={[
          { key: "display", label: "Display", kind: "select", options: ["", "block", "flex"] },
          { key: "flexDirection", label: "Direction", kind: "select", options: ["", "row", "column"] },
          { key: "justifyContent", label: "Justify", kind: "select", options: ["", "flex-start", "center", "flex-end", "space-between"] },
          { key: "alignItems", label: "Align", kind: "select", options: ["", "stretch", "flex-start", "center", "flex-end"] },
          { key: "gap", label: "Gap", kind: "length", tokens: getSpacingTokens().map((t) => t.value) },
        ]}
        nodeStyle={style}
        breakpoint={props.breakpoint}
        disabled={props.disabled}
        onPatchStyle={props.onPatchStyle}
      />

      <StyleGroup
        label="Box"
        fields={[
          { key: "padding", label: "Padding", kind: "length", tokens: getSpacingTokens().map((t) => t.value) },
          { key: "margin", label: "Margin", kind: "length", tokens: getSpacingTokens().map((t) => t.value) },
          { key: "width", label: "Width", kind: "length" },
          { key: "maxWidth", label: "Max width", kind: "length" },
          { key: "minHeight", label: "Min height", kind: "length" },
        ]}
        nodeStyle={style}
        breakpoint={props.breakpoint}
        disabled={props.disabled}
        onPatchStyle={props.onPatchStyle}
      />

      <StyleGroup
        label="Typography"
        fields={[
          { key: "fontFamily", label: "Font family", kind: "text", tokens: FONT_FAMILY_TOKENS.map((t) => t.value) },
          { key: "fontSize", label: "Font size", kind: "text", tokens: FONT_SIZE_TOKENS.map((t) => t.value) },
          { key: "fontWeight", label: "Font weight", kind: "text" },
          { key: "lineHeight", label: "Line height", kind: "text" },
          { key: "textAlign", label: "Align", kind: "select", options: ["", "left", "center", "right"] },
          { key: "color", label: "Text color", kind: "color", tokens: COLOR_TOKENS.map((t) => t.value) },
        ]}
        nodeStyle={style}
        breakpoint={props.breakpoint}
        disabled={props.disabled}
        onPatchStyle={props.onPatchStyle}
      />

      <StyleGroup
        label="Visual"
        fields={[
          { key: "backgroundColor", label: "Background", kind: "color", tokens: COLOR_TOKENS.map((t) => t.value) },
          { key: "borderRadius", label: "Radius", kind: "length" },
          { key: "border", label: "Border", kind: "text" },
          { key: "boxShadow", label: "Shadow", kind: "text" },
          { key: "opacity", label: "Opacity", kind: "number" },
        ]}
        nodeStyle={style}
        breakpoint={props.breakpoint}
        disabled={props.disabled}
        onPatchStyle={props.onPatchStyle}
      />
    </div>
  );
}

function StyleGroup(props: {
  label: string;
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
    <div className={styles.group}>
      <div className={styles.groupHeader}>{props.label}</div>
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
    </div>
  );
}

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

function TokenTextField(props: {
  id?: string;
  disabled?: boolean;
  value: string;
  placeholder?: string;
  tokens?: string[];
  onChange: (value: string) => void;
  "aria-invalid"?: boolean | undefined;
}) {
  const datalistId = props.tokens?.length ? `${props.id ?? "token"}_tokens` : undefined;

  return (
    <div className={styles.tokenField}>
      {props.tokens?.length ? (
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
          {props.tokens.map((t) => (
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
          {props.tokens?.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
}

function propKeyFromPath(path: string): string | null {
  if (!path.startsWith("props.")) return null;
  const key = path.slice("props.".length);
  if (!key) return null;
  if (key.includes(".")) return null;
  return key;
}

