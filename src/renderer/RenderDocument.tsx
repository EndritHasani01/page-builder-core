import type { CSSProperties, ClipboardEvent, KeyboardEvent, MouseEvent } from "react";
import { Fragment, memo, useCallback, useLayoutEffect, useMemo, useRef } from "react";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import type { Breakpoint, Document, Node, NodeId, RichContent } from "@/editor-core";
import { blockRegistry, buildSegmentDomNode, domToRichContent, isProbablySafeUrl } from "@/editor-core";

import { containerDropId, nodeDragId, type DragPayload } from "@/dnd";

import { FloatingToolbar } from "@/ui/PageBuilder/components/FloatingToolbar";

import styles from "./RenderDocument.module.css";
import { mergeCss, resolveResponsiveStyle, stylePropsToCss, themeToCssVars } from "./renderUtils";

export type RenderMode = "editor" | "preview" | "export";

export type RenderDocumentProps = {
  doc: Document;
  mode: RenderMode;
  breakpoint: Breakpoint;
  disableNavigation?: boolean;
  selectedId?: NodeId | null;
  hoveredId?: NodeId | null;
  onSelect?: (nodeId: NodeId) => void;
  onHover?: (nodeId: NodeId | null) => void;

  enableDnd?: boolean;
  draggingId?: NodeId | null;
  dropTargetId?: NodeId | null;
  dropInvalidId?: NodeId | null;

  inlineTextEditingId?: NodeId | null;
  onStartInlineTextEdit?: (nodeId: NodeId) => void;
  onCommitInlineTextEdit?: (nodeId: NodeId, nextContent: RichContent) => void;
  onCancelInlineTextEdit?: (nodeId: NodeId) => void;

  /** Called when a form is submitted in preview mode (preventDefault already called). */
  onPreviewFormSubmit?: () => void;
};

export function RenderDocument(props: RenderDocumentProps) {
  const rootStyle = useMemo(() => {
    return mergeCss(themeToCssVars(props.doc.theme), {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-base)",
      color: "var(--color-text)",
      background: "var(--color-bg)",
      minHeight: "100%",
    });
  }, [props.doc.theme]);

  return (
    <div style={rootStyle}>
      {props.mode === "editor" && props.enableDnd ? (
        <NodeRendererWithDnd nodeId={props.doc.rootId} {...props} />
      ) : (
        <NodeRenderer nodeId={props.doc.rootId} {...props} />
      )}
    </div>
  );
}

type NodeRendererProps = RenderDocumentProps & {
  nodeId: NodeId;
};

const NodeRenderer = memo(function NodeRenderer(props: NodeRendererProps) {
  const { nodeId, ...rest } = props;
  const node = props.doc.nodes[nodeId];

  const resolvedStyle = useMemo(() => resolveResponsiveStyle(node?.style, props.breakpoint), [node?.style, props.breakpoint]);
  const nodeStyle = useMemo(() => stylePropsToCss(resolvedStyle), [resolvedStyle]);

  if (!node) {
    if (props.mode === "editor") {
      return <div className={styles.missingNode}>Missing node: {nodeId}</div>;
    }
    return null;
  }

  const hidden = Boolean(node.constraints?.hidden);
  if (hidden && props.mode !== "editor") return null;

  const selected = props.mode === "editor" && props.selectedId === node.id;
  const hovered = props.mode === "editor" && props.hoveredId === node.id;

  const dataAttrs: Record<string, string> =
    props.mode === "editor"
      ? {
          "data-node-id": node.id,
          "data-node-type": node.type,
        }
      : {};

  const chromeClassName =
    props.mode === "editor"
      ? [
          styles.node,
          selected ? styles.nodeSelected : null,
          hovered ? styles.nodeHovered : null,
          hidden ? styles.nodeHidden : null,
        ]
          .filter(Boolean)
          .join(" ")
      : undefined;

  const onSelectNode = props.mode === "editor" && props.onSelect ? (e: MouseEvent) => {
    e.stopPropagation();
    props.onSelect?.(node.id);
  } : undefined;

  const onFocusNode =
    props.mode === "editor" && props.onSelect
      ? () => {
          props.onSelect?.(node.id);
        }
      : undefined;

  const onMouseEnter =
    props.mode === "editor" && props.onHover
      ? () => props.onHover?.(node.id)
      : undefined;

  const onMouseLeave =
    props.mode === "editor" && props.onHover
      ? () => props.onHover?.(node.parentId)
      : undefined;

  const chrome = props.mode === "editor"
    ? (
      <>
        <button
          type="button"
          className={styles.dragHandle}
          data-dnd-handle="true"
          aria-label={`Drag ${blockRegistry[node.type].label}`}
          onClick={onSelectNode}
          onFocus={onFocusNode}
        >
          Drag
        </button>
        {hidden ? <span className={styles.hiddenBadge}>Hidden</span> : null}
      </>
    )
    : null;

  const children = node.children.map((childId) => (
    <NodeRenderer key={childId} nodeId={childId} {...rest} />
  ));

  return renderNode({
    node,
    mode: props.mode,
    breakpoint: props.breakpoint,
    disableNavigation: props.disableNavigation,
    chrome,
    chromeClassName,
    dataAttrs,
    nodeStyle,
    inlineTextEditingId: props.inlineTextEditingId,
    onStartInlineTextEdit: props.onStartInlineTextEdit,
    onCommitInlineTextEdit: props.onCommitInlineTextEdit,
    onCancelInlineTextEdit: props.onCancelInlineTextEdit,
    onPreviewFormSubmit: props.onPreviewFormSubmit,
    onSelectNode,
    onMouseEnter,
    onMouseLeave,
    children,
  });
});

const NodeRendererWithDnd = memo(function NodeRendererWithDnd(props: NodeRendererProps) {
  const { nodeId, ...rest } = props;
  const node = props.doc.nodes[nodeId];

  const resolvedStyle = useMemo(() => resolveResponsiveStyle(node?.style, props.breakpoint), [node?.style, props.breakpoint]);
  const nodeStyle = useMemo(() => stylePropsToCss(resolvedStyle), [resolvedStyle]);

  const canHaveChildren = node ? blockRegistry[node.type].allowedChildren.length > 0 : false;

  const draggableEnabled =
    Boolean(props.enableDnd) &&
    Boolean(node) &&
    nodeId !== props.doc.rootId &&
    props.inlineTextEditingId !== nodeId &&
    node.constraints?.locked !== true &&
    node.constraints?.draggable !== false;

  const droppableEnabled = Boolean(props.enableDnd) && canHaveChildren;

  const draggable = useDraggable({
    id: nodeDragId(nodeId),
    disabled: !draggableEnabled,
    data: { kind: "node", nodeId } satisfies DragPayload,
  });

  const droppable = useDroppable({
    id: containerDropId(nodeId),
    disabled: !droppableEnabled,
    data: { kind: "container", nodeId } as const,
  });

  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setActivatorNodeRef: setDragActivatorRef,
    setNodeRef: setDragNodeRef,
    transform: dragTransform,
    isDragging,
  } = draggable;

  const { setNodeRef: setDropNodeRef } = droppable;

  const dndRef = (el: HTMLElement | null) => {
    setDragNodeRef(el);
    setDropNodeRef(el);
  };

  const transform = dragTransform ? CSS.Translate.toString(dragTransform) : undefined;
  const wrapperStyle = mergeCss(
    transform ? ({ transform } satisfies CSSProperties) : undefined,
    isDragging ? ({ opacity: 0.35 } satisfies CSSProperties) : undefined,
  );

  if (!node) {
    return <div className={styles.missingNode}>Missing node: {nodeId}</div>;
  }

  const hidden = Boolean(node.constraints?.hidden);
  const selected = props.selectedId === node.id;
  const hovered = props.hoveredId === node.id;

  const isDropTarget = props.dropTargetId === node.id;
  const isDropInvalid = props.dropInvalidId === node.id;

  const dataAttrs: Record<string, string> = {
    "data-node-id": node.id,
    "data-node-type": node.type,
  };
  if (canHaveChildren) dataAttrs["data-dnd-container"] = "true";
  if (draggableEnabled) dataAttrs["data-dnd-draggable"] = "true";

  const chromeClassName =
    [
      styles.node,
      selected ? styles.nodeSelected : null,
      hovered ? styles.nodeHovered : null,
      hidden ? styles.nodeHidden : null,
      isDragging ? styles.nodeDragging : null,
      isDropTarget ? styles.nodeDropTarget : null,
      isDropInvalid ? styles.nodeDropInvalid : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  const onSelectNode = props.onSelect ? (e: MouseEvent) => {
    e.stopPropagation();
    props.onSelect?.(node.id);
  } : undefined;

  const onFocusNode = props.onSelect
    ? () => {
        props.onSelect?.(node.id);
      }
    : undefined;

  const onMouseEnter = props.onHover ? () => props.onHover?.(node.id) : undefined;
  const onMouseLeave = props.onHover ? () => props.onHover?.(node.parentId) : undefined;

  const chrome = (
    <>
      <button
        type="button"
        ref={setDragActivatorRef}
        className={styles.dragHandle}
        data-dnd-handle="true"
        aria-label={`Drag ${blockRegistry[node.type].label}`}
        onClick={onSelectNode}
        onFocus={onFocusNode}
        {...dragAttributes}
        {...dragListeners}
      >
        Drag
      </button>
      {hidden ? <span className={styles.hiddenBadge}>Hidden</span> : null}
    </>
  );

  const children = node.children.map((childId) => (
    <NodeRendererWithDnd key={childId} nodeId={childId} {...rest} />
  ));

  return renderNode({
    node,
    mode: props.mode,
    breakpoint: props.breakpoint,
    disableNavigation: props.disableNavigation,
    chrome,
    chromeClassName,
    dataAttrs,
    nodeStyle,
    wrapperStyle,
    inlineTextEditingId: props.inlineTextEditingId,
    onStartInlineTextEdit: props.onStartInlineTextEdit,
    onCommitInlineTextEdit: props.onCommitInlineTextEdit,
    onCancelInlineTextEdit: props.onCancelInlineTextEdit,
    onPreviewFormSubmit: props.onPreviewFormSubmit,
    onSelectNode,
    onMouseEnter,
    onMouseLeave,
    children,
    dndRef,
  });
});

function renderNode(args: {
  node: Node;
  mode: RenderMode;
  breakpoint: Breakpoint;
  disableNavigation?: boolean;
  chrome: React.ReactNode;
  chromeClassName?: string;
  dataAttrs: Record<string, string> | Record<string, never>;
  nodeStyle: CSSProperties;
  wrapperStyle?: CSSProperties;
  onSelectNode?: (e: MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children: React.ReactNode;
  dndRef?: (el: HTMLElement | null) => void;

  inlineTextEditingId?: NodeId | null;
  onStartInlineTextEdit?: (nodeId: NodeId) => void;
  onCommitInlineTextEdit?: (nodeId: NodeId, nextContent: RichContent) => void;
  onCancelInlineTextEdit?: (nodeId: NodeId) => void;
  onPreviewFormSubmit?: () => void;
}) {
  const { node, mode, breakpoint } = args;

  switch (node.type) {
    case "page": {
      const intrinsic: CSSProperties = { minHeight: "100%" };
      const style = mergeCss(intrinsic, args.nodeStyle, args.wrapperStyle);
      return (
        <div
          lang={node.props.lang}
          {...args.dataAttrs}
          className={args.chromeClassName}
          style={style}
          ref={args.dndRef as never}
          onClick={args.onSelectNode}
          onMouseEnter={args.onMouseEnter}
          onMouseLeave={args.onMouseLeave}
        >
          {args.chrome}
          {args.children}
        </div>
      );
    }

    case "section": {
      const padding = node.props.variant === "hero" ? "64px 16px" : "24px 16px";
      const intrinsic: CSSProperties = { padding };
      const style = mergeCss(intrinsic, args.nodeStyle, args.wrapperStyle);
      return (
        <section
          {...args.dataAttrs}
          className={args.chromeClassName}
          style={style}
          ref={args.dndRef as never}
          onClick={args.onSelectNode}
          onMouseEnter={args.onMouseEnter}
          onMouseLeave={args.onMouseLeave}
        >
          {args.chrome}
          {node.props.fullWidth ? (
            args.children
          ) : (
            <div style={{ maxWidth: "1100px", margin: "0 auto" }}>{args.children}</div>
          )}
        </section>
      );
    }

    case "columns": {
      const isSmall = breakpoint === "base" || breakpoint === "sm";
      const intrinsic: CSSProperties = {
        display: "flex",
        flexDirection: isSmall ? "column" : "row",
        gap: node.props.gap,
        alignItems: "stretch",
        minHeight: mode === "editor" ? "44px" : undefined,
      };
      const style = mergeCss(intrinsic, args.nodeStyle, args.wrapperStyle);
      return (
        <div
          {...args.dataAttrs}
          className={args.chromeClassName}
          style={style}
          ref={args.dndRef as never}
          onClick={args.onSelectNode}
          onMouseEnter={args.onMouseEnter}
          onMouseLeave={args.onMouseLeave}
        >
          {args.chrome}
          {args.children}
        </div>
      );
    }

    case "column": {
      const flex = node.props.width ? `0 0 ${node.props.width}` : "1 1 0";
      const intrinsic: CSSProperties = {
        flex,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        minHeight: mode === "editor" ? "44px" : undefined,
      };
      const style = mergeCss(intrinsic, args.nodeStyle, args.wrapperStyle);
      return (
        <div
          {...args.dataAttrs}
          className={args.chromeClassName}
          style={style}
          ref={args.dndRef as never}
          onClick={args.onSelectNode}
          onMouseEnter={args.onMouseEnter}
          onMouseLeave={args.onMouseLeave}
        >
          {args.chrome}
          {args.children}
        </div>
      );
    }

    case "container": {
      const Tag = node.props.as;
      const intrinsic = mode === "editor" ? ({ minHeight: "32px" } satisfies CSSProperties) : undefined;
      const style = mergeCss(intrinsic, args.nodeStyle, args.wrapperStyle);
      return (
        <Tag
          {...args.dataAttrs}
          className={args.chromeClassName}
          style={style}
          ref={args.dndRef as never}
          onClick={args.onSelectNode}
          onMouseEnter={args.onMouseEnter}
          onMouseLeave={args.onMouseLeave}
        >
          {args.chrome}
          {args.children}
        </Tag>
      );
    }

    case "text": {
      const Tag = node.props.as;
      const richNodes = renderRichContent(node.props.content, args.disableNavigation);

      if (mode !== "editor") {
        if (node.props.listType) {
          const ListTag = node.props.listType;
          return <ListTag style={args.nodeStyle}><li>{richNodes}</li></ListTag>;
        }
        return <Tag style={args.nodeStyle}>{richNodes}</Tag>;
      }

      const isEditing = args.inlineTextEditingId === node.id;
      const canEditInline = Boolean(args.onStartInlineTextEdit && args.onCommitInlineTextEdit && args.onCancelInlineTextEdit);
      const startInlineEdit =
        canEditInline && node.constraints?.locked !== true
          ? (e: MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              args.onStartInlineTextEdit?.(node.id);
            }
          : undefined;

      const wrapperClassName =
        Tag === "span"
          ? [styles.wrapped, styles.wrappedInline].join(" ")
          : styles.wrapped;

      const staticContent = node.props.listType ? (
        <node.props.listType className={args.chromeClassName} style={args.nodeStyle} onDoubleClick={startInlineEdit}>
          <li>{richNodes}</li>
        </node.props.listType>
      ) : (
        <Tag className={args.chromeClassName} style={args.nodeStyle} onDoubleClick={startInlineEdit}>
          {richNodes}
        </Tag>
      );

      return (
        <div
          {...args.dataAttrs}
          className={wrapperClassName}
          style={args.wrapperStyle}
          ref={args.dndRef as never}
          onClick={args.onSelectNode}
          onMouseEnter={args.onMouseEnter}
          onMouseLeave={args.onMouseLeave}
        >
          {args.chrome}
          {isEditing ? (
            <InlineEditableText
              tag={Tag}
              content={node.props.content}
              className={args.chromeClassName}
              style={args.nodeStyle}
              onCommit={(nextContent) => args.onCommitInlineTextEdit?.(node.id, nextContent)}
              onCancel={() => args.onCancelInlineTextEdit?.(node.id)}
            />
          ) : (
            staticContent
          )}
        </div>
      );
    }

    case "image": {
      const imgStyle = mergeCss({ width: "100%", display: "block", objectFit: node.props.fit }, args.nodeStyle);
      const safeSrc = node.props.src.trim() && isProbablySafeUrl(node.props.src) ? node.props.src : "";
      const img = <img src={safeSrc || undefined} alt={node.props.alt} style={imgStyle} />;

      if (mode === "editor") {
        return (
          <div
            {...args.dataAttrs}
            className={[styles.wrapped, args.chromeClassName].filter(Boolean).join(" ")}
            style={args.wrapperStyle}
            ref={args.dndRef as never}
            onClick={args.onSelectNode}
            onMouseEnter={args.onMouseEnter}
            onMouseLeave={args.onMouseLeave}
          >
            {args.chrome}
            {img}
          </div>
        );
      }

      const linkTo = node.props.linkTo?.trim() && isProbablySafeUrl(node.props.linkTo) ? node.props.linkTo : "";
      if (linkTo) {
        return (
          <a
            href={linkTo}
            onClick={
              mode === "preview" && args.disableNavigation
                ? (e) => {
                    e.preventDefault();
                  }
                : undefined
            }
          >
            {img}
          </a>
        );
      }
      return img;
    }

    case "button": {
      const baseStyle: CSSProperties = {
        display: "inline-block",
        padding: "10px 14px",
        borderRadius: "10px",
        border: "1px solid var(--color-border)",
        textDecoration: "none",
      };

      const variantStyle: CSSProperties =
        node.props.variant === "primary"
          ? { background: "var(--color-primary)", color: "#ffffff", borderColor: "transparent" }
          : { background: "#ffffff", color: "var(--color-text)" };

      const buttonStyle = mergeCss(baseStyle, variantStyle, args.nodeStyle);

      const href = node.props.href.trim();
      const safeHref = href && isProbablySafeUrl(href) ? href : "";
      const hasLink = Boolean(safeHref);

      if (mode === "editor") {
        return (
          <span
            {...args.dataAttrs}
            className={[styles.wrapped, styles.wrappedInline].join(" ")}
            style={args.wrapperStyle}
            ref={args.dndRef as never}
            onClick={args.onSelectNode}
            onMouseEnter={args.onMouseEnter}
            onMouseLeave={args.onMouseLeave}
          >
            {args.chrome}
            {hasLink ? (
              <a
                href={safeHref}
                style={buttonStyle}
                className={args.chromeClassName}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  args.onSelectNode?.(e);
                }}
              >
                {node.props.label}
              </a>
            ) : (
              <button
                type="button"
                style={buttonStyle}
                className={args.chromeClassName}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  args.onSelectNode?.(e);
                }}
              >
                {node.props.label}
              </button>
            )}
          </span>
        );
      }

      if (hasLink) {
        return (
          <a
            href={safeHref}
            style={buttonStyle}
            onClick={
              mode === "preview" && args.disableNavigation
                ? (e) => {
                    e.preventDefault();
                  }
                : undefined
            }
          >
            {node.props.label}
          </a>
        );
      }

      return (
        <button type="button" style={buttonStyle}>
          {node.props.label}
        </button>
      );
    }

    case "spacer": {
      const intrinsic: CSSProperties = { height: node.props.height, width: "100%" };
      const style = mergeCss(intrinsic, args.nodeStyle, args.wrapperStyle);
      return (
        <div
          {...args.dataAttrs}
          className={args.chromeClassName}
          style={style}
          ref={args.dndRef as never}
          aria-hidden="true"
          onClick={args.onSelectNode}
          onMouseEnter={args.onMouseEnter}
          onMouseLeave={args.onMouseLeave}
        >
          {args.chrome}
        </div>
      );
    }

    case "divider": {
      const hrStyle = mergeCss(
        {
          width: "100%",
          border: "none",
          borderTop: `${node.props.thickness} solid ${node.props.color}`,
        },
        args.nodeStyle,
      );

      if (mode !== "editor") {
        return <hr style={hrStyle} />;
      }

      return (
        <div
          {...args.dataAttrs}
          className={styles.wrapped}
          style={args.wrapperStyle}
          ref={args.dndRef as never}
          onClick={args.onSelectNode}
          onMouseEnter={args.onMouseEnter}
          onMouseLeave={args.onMouseLeave}
        >
          {args.chrome}
          <hr className={args.chromeClassName} style={hrStyle} />
        </div>
      );
    }

    case "form": {
      const style = mergeCss(args.nodeStyle, args.wrapperStyle);

      if (mode === "editor") {
        return (
          <div
            {...args.dataAttrs}
            className={args.chromeClassName}
            style={style}
            ref={args.dndRef as never}
            onClick={args.onSelectNode}
            onMouseEnter={args.onMouseEnter}
            onMouseLeave={args.onMouseLeave}
          >
            {args.chrome}
            <div style={{ pointerEvents: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
              {args.children}
            </div>
          </div>
        );
      }

      const safeAction = node.props.action.trim() && isProbablySafeUrl(node.props.action) ? node.props.action : undefined;
      return (
        <form
          action={safeAction}
          method={node.props.method}
          name={node.props.name || undefined}
          style={style}
          onSubmit={
            mode === "preview"
              ? (e) => {
                  e.preventDefault();
                  args.onPreviewFormSubmit?.();
                }
              : undefined
          }
        >
          {args.children}
        </form>
      );
    }

    case "textInput": {
      const fieldId = `field-${node.id}`;
      const inputStyle: CSSProperties = {
        display: "block",
        width: "100%",
        padding: "8px 10px",
        borderRadius: "6px",
        border: "1px solid var(--color-border)",
        fontSize: "var(--text-base)",
        fontFamily: "inherit",
        background: "#ffffff",
        color: "var(--color-text)",
      };
      const labelStyle: CSSProperties = { display: "block", fontWeight: 500, fontSize: "0.9em", marginBottom: "4px" };
      const wrapperStyle: CSSProperties = { display: "flex", flexDirection: "column", ...args.nodeStyle };

      if (mode === "editor") {
        return (
          <div
            {...args.dataAttrs}
            className={[styles.wrapped, args.chromeClassName].filter(Boolean).join(" ")}
            style={args.wrapperStyle}
            ref={args.dndRef as never}
            onClick={args.onSelectNode}
            onMouseEnter={args.onMouseEnter}
            onMouseLeave={args.onMouseLeave}
          >
            {args.chrome}
            <div style={{ pointerEvents: "none", ...wrapperStyle }}>
              <label style={labelStyle}>{node.props.label || "Label"}</label>
              <input
                type={node.props.inputType}
                placeholder={node.props.placeholder}
                required={node.props.required}
                style={inputStyle}
                readOnly
              />
            </div>
          </div>
        );
      }

      return (
        <div style={wrapperStyle}>
          <label htmlFor={fieldId} style={labelStyle}>{node.props.label}</label>
          <input
            id={fieldId}
            type={node.props.inputType}
            name={node.props.name}
            placeholder={node.props.placeholder}
            required={node.props.required}
            style={inputStyle}
          />
        </div>
      );
    }

    case "textarea": {
      const fieldId = `field-${node.id}`;
      const inputStyle: CSSProperties = {
        display: "block",
        width: "100%",
        padding: "8px 10px",
        borderRadius: "6px",
        border: "1px solid var(--color-border)",
        fontSize: "var(--text-base)",
        fontFamily: "inherit",
        background: "#ffffff",
        color: "var(--color-text)",
        resize: "vertical",
      };
      const labelStyle: CSSProperties = { display: "block", fontWeight: 500, fontSize: "0.9em", marginBottom: "4px" };
      const wrapperStyle: CSSProperties = { display: "flex", flexDirection: "column", ...args.nodeStyle };

      if (mode === "editor") {
        return (
          <div
            {...args.dataAttrs}
            className={[styles.wrapped, args.chromeClassName].filter(Boolean).join(" ")}
            style={args.wrapperStyle}
            ref={args.dndRef as never}
            onClick={args.onSelectNode}
            onMouseEnter={args.onMouseEnter}
            onMouseLeave={args.onMouseLeave}
          >
            {args.chrome}
            <div style={{ pointerEvents: "none", ...wrapperStyle }}>
              <label style={labelStyle}>{node.props.label || "Label"}</label>
              <textarea
                rows={node.props.rows}
                placeholder={node.props.placeholder}
                required={node.props.required}
                style={inputStyle}
                readOnly
              />
            </div>
          </div>
        );
      }

      return (
        <div style={wrapperStyle}>
          <label htmlFor={fieldId} style={labelStyle}>{node.props.label}</label>
          <textarea
            id={fieldId}
            name={node.props.name}
            rows={node.props.rows}
            placeholder={node.props.placeholder}
            required={node.props.required}
            style={inputStyle}
          />
        </div>
      );
    }

    case "selectInput": {
      const fieldId = `field-${node.id}`;
      const selectStyle: CSSProperties = {
        display: "block",
        width: "100%",
        padding: "8px 10px",
        borderRadius: "6px",
        border: "1px solid var(--color-border)",
        fontSize: "var(--text-base)",
        fontFamily: "inherit",
        background: "#ffffff",
        color: "var(--color-text)",
      };
      const labelStyle: CSSProperties = { display: "block", fontWeight: 500, fontSize: "0.9em", marginBottom: "4px" };
      const wrapperStyle: CSSProperties = { display: "flex", flexDirection: "column", ...args.nodeStyle };
      const opts = node.props.options ?? [];

      if (mode === "editor") {
        return (
          <div
            {...args.dataAttrs}
            className={[styles.wrapped, args.chromeClassName].filter(Boolean).join(" ")}
            style={args.wrapperStyle}
            ref={args.dndRef as never}
            onClick={args.onSelectNode}
            onMouseEnter={args.onMouseEnter}
            onMouseLeave={args.onMouseLeave}
          >
            {args.chrome}
            <div style={{ pointerEvents: "none", ...wrapperStyle }}>
              <label style={labelStyle}>{node.props.label || "Label"}</label>
              <select style={selectStyle} required={node.props.required}>
                {opts.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        );
      }

      return (
        <div style={wrapperStyle}>
          <label htmlFor={fieldId} style={labelStyle}>{node.props.label}</label>
          <select id={fieldId} name={node.props.name} required={node.props.required} style={selectStyle}>
            {opts.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      );
    }

    case "checkbox": {
      const fieldId = `field-${node.id}`;
      const wrapperStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "8px", ...args.nodeStyle };
      const labelStyle: CSSProperties = { cursor: "pointer" };

      if (mode === "editor") {
        return (
          <div
            {...args.dataAttrs}
            className={[styles.wrapped, args.chromeClassName].filter(Boolean).join(" ")}
            style={args.wrapperStyle}
            ref={args.dndRef as never}
            onClick={args.onSelectNode}
            onMouseEnter={args.onMouseEnter}
            onMouseLeave={args.onMouseLeave}
          >
            {args.chrome}
            <div style={{ pointerEvents: "none", ...wrapperStyle }}>
              <input type="checkbox" defaultChecked={node.props.checked} readOnly />
              <span>{node.props.label || "Label"}</span>
            </div>
          </div>
        );
      }

      return (
        <div style={wrapperStyle}>
          <input
            type="checkbox"
            id={fieldId}
            name={node.props.name}
            defaultChecked={node.props.checked}
          />
          <label htmlFor={fieldId} style={labelStyle}>{node.props.label}</label>
        </div>
      );
    }

    case "radioGroup": {
      const fieldsetStyle: CSSProperties = { border: "none", padding: 0, margin: 0, ...args.nodeStyle };
      const legendStyle: CSSProperties = { fontWeight: 500, marginBottom: "6px" };
      const radioRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" };
      const opts = node.props.options ?? [];

      if (mode === "editor") {
        return (
          <div
            {...args.dataAttrs}
            className={[styles.wrapped, args.chromeClassName].filter(Boolean).join(" ")}
            style={args.wrapperStyle}
            ref={args.dndRef as never}
            onClick={args.onSelectNode}
            onMouseEnter={args.onMouseEnter}
            onMouseLeave={args.onMouseLeave}
          >
            {args.chrome}
            <fieldset style={{ pointerEvents: "none", ...fieldsetStyle }}>
              <legend style={legendStyle}>{node.props.label || "Group"}</legend>
              {opts.map((opt) => (
                <div key={opt.value} style={radioRowStyle}>
                  <input type="radio" name={node.props.name} value={opt.value} readOnly />
                  <span>{opt.label}</span>
                </div>
              ))}
            </fieldset>
          </div>
        );
      }

      return (
        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>{node.props.label}</legend>
          {opts.map((opt, i) => {
            const radioId = `field-${node.id}-${i}`;
            return (
              <div key={opt.value} style={radioRowStyle}>
                <input
                  type="radio"
                  id={radioId}
                  name={node.props.name}
                  value={opt.value}
                  required={node.props.required && i === 0}
                />
                <label htmlFor={radioId}>{opt.label}</label>
              </div>
            );
          })}
        </fieldset>
      );
    }

    case "submitButton": {
      const baseStyle: CSSProperties = {
        display: "inline-block",
        padding: "10px 14px",
        borderRadius: "10px",
        border: "1px solid var(--color-border)",
        cursor: "pointer",
        fontSize: "var(--text-base)",
        fontFamily: "inherit",
      };
      const variantStyle: CSSProperties =
        node.props.variant === "primary"
          ? { background: "var(--color-primary)", color: "#ffffff", borderColor: "transparent" }
          : { background: "#ffffff", color: "var(--color-text)" };
      const buttonStyle = mergeCss(baseStyle, variantStyle, args.nodeStyle);

      if (mode === "editor") {
        return (
          <span
            {...args.dataAttrs}
            className={[styles.wrapped, styles.wrappedInline].join(" ")}
            style={args.wrapperStyle}
            ref={args.dndRef as never}
            onClick={args.onSelectNode}
            onMouseEnter={args.onMouseEnter}
            onMouseLeave={args.onMouseLeave}
          >
            {args.chrome}
            <button
              type="button"
              style={{ ...buttonStyle, pointerEvents: "none" }}
              className={args.chromeClassName}
            >
              {node.props.label}
            </button>
          </span>
        );
      }

      return (
        <button type="submit" style={buttonStyle}>
          {node.props.label}
        </button>
      );
    }

    default: {
      const _exhaustive: never = node;
      return _exhaustive;
    }
  }
}

/**
 * Renders a RichContent array as React nodes. Each segment is wrapped in
 * appropriate inline elements (strong, em, u, s, code, a) for its active marks.
 */
function renderRichContent(content: RichContent, disableNavigation?: boolean): React.ReactNode {
  return content.map((seg, i) => {
    let inner: React.ReactNode = seg.text;
    if (seg.code) inner = <code>{inner}</code>;
    if (seg.link?.href && isProbablySafeUrl(seg.link.href)) {
      const href = seg.link.href;
      inner = (
        <a
          href={href}
          onClick={disableNavigation ? (e) => e.preventDefault() : undefined}
        >
          {inner}
        </a>
      );
    }
    if (seg.strikethrough) inner = <s>{inner}</s>;
    if (seg.underline) inner = <u>{inner}</u>;
    if (seg.italic) inner = <em>{inner}</em>;
    if (seg.bold) inner = <strong>{inner}</strong>;
    return <Fragment key={i}>{inner}</Fragment>;
  });
}

/**
 * Inline contentEditable editor for text nodes. Initializes DOM content from
 * a RichContent array via useLayoutEffect (not React children) to avoid
 * reconciliation conflicts during editing. Reads back structured content
 * via domToRichContent on commit.
 *
 * The FloatingToolbar component (rendered as a portal sibling) intercepts
 * selectionchange events and applies formatting via document.execCommand.
 * This is the one place in the project where inline scripts / DOM mutation
 * outside React's control are intentional and safe — the resulting content
 * goes through domToRichContent normalization before being stored.
 */
function InlineEditableText(props: {
  tag: "p" | "h1" | "h2" | "h3" | "span";
  content: RichContent;
  className?: string;
  style?: CSSProperties;
  onCommit: (nextContent: RichContent) => void;
  onCancel: () => void;
}) {
  const elRef = useRef<HTMLElement | null>(null);
  const endedRef = useRef(false);

  const endIfNeeded = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
  }, []);

  const commit = useCallback(() => {
    if (endedRef.current) return;
    endIfNeeded();
    const el = elRef.current;
    const nextContent = el ? domToRichContent(el) : [{ text: "" }];
    props.onCommit(nextContent);
  }, [endIfNeeded, props]);

  const cancel = useCallback(() => {
    if (endedRef.current) return;
    endIfNeeded();
    props.onCancel();
  }, [endIfNeeded, props]);

  useLayoutEffect(() => {
    const el = elRef.current;
    if (!el) return;

    // Initialize DOM from rich content. React does not manage this element's
    // children — we populate imperatively and let the user edit freely.
    el.innerHTML = "";
    for (const seg of props.content) {
      el.appendChild(buildSegmentDomNode(seg));
    }

    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }

    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only runs on mount; content is stable during editing

  const onPaste = useCallback((e: ClipboardEvent<HTMLElement>) => {
    e.preventDefault();
    const el = elRef.current;
    if (!el) return;

    const html = e.clipboardData.getData("text/html");
    const plain = e.clipboardData.getData("text/plain");

    const sel = window.getSelection();
    const hasSelInEl = sel && sel.rangeCount > 0 && el.contains(sel.anchorNode);

    if (hasSelInEl) {
      const range = sel.getRangeAt(0);
      range.deleteContents();

      const frag = document.createDocumentFragment();
      if (html) {
        const tmp = document.createElement("div");
        tmp.innerHTML = html;
        const segs = domToRichContent(tmp);
        for (const seg of segs) frag.appendChild(buildSegmentDomNode(seg));
      } else {
        frag.appendChild(document.createTextNode(plain));
      }

      range.insertNode(frag);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      el.appendChild(document.createTextNode(plain));
    }
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancel();
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        commit();
      }
    },
    [cancel, commit],
  );

  const Tag = props.tag;
  return (
    <>
      <Tag
        ref={elRef as never}
        className={props.className}
        style={props.style}
        contentEditable={true}
        suppressContentEditableWarning={true}
        onBlur={commit}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
      />
      <FloatingToolbar editingRef={elRef} />
    </>
  );
}
