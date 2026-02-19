import type { CSSProperties, ClipboardEvent, KeyboardEvent, MouseEvent } from "react";
import { memo, useCallback, useLayoutEffect, useMemo, useRef } from "react";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import type { Breakpoint, Document, Node, NodeId } from "@/editor-core";
import { blockRegistry, isProbablySafeUrl } from "@/editor-core";

import { containerDropId, nodeDragId, type DragPayload } from "@/dnd";

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
  onCommitInlineTextEdit?: (nodeId: NodeId, nextText: string) => void;
  onCancelInlineTextEdit?: (nodeId: NodeId) => void;
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
  onCommitInlineTextEdit?: (nodeId: NodeId, nextText: string) => void;
  onCancelInlineTextEdit?: (nodeId: NodeId) => void;
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
      if (mode !== "editor") {
        return <Tag style={args.nodeStyle}>{node.props.text}</Tag>;
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
              text={node.props.text}
              className={args.chromeClassName}
              style={args.nodeStyle}
              onCommit={(nextText) => args.onCommitInlineTextEdit?.(node.id, nextText)}
              onCancel={() => args.onCancelInlineTextEdit?.(node.id)}
            />
          ) : (
            <Tag className={args.chromeClassName} style={args.nodeStyle} onDoubleClick={startInlineEdit}>
              {node.props.text}
            </Tag>
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

    default: {
      const _exhaustive: never = node;
      return _exhaustive;
    }
  }
}

function InlineEditableText(props: {
  tag: "p" | "h1" | "h2" | "h3" | "span";
  text: string;
  className?: string;
  style?: CSSProperties;
  onCommit: (nextText: string) => void;
  onCancel: () => void;
}) {
  const elRef = useRef<HTMLElement | null>(null);
  const endedRef = useRef(false);

  const endIfNeeded = useCallback(() => {
    endedRef.current = true;
  }, []);

  const commit = useCallback(() => {
    if (endedRef.current) return;
    endIfNeeded();
    const nextText = elRef.current?.textContent ?? "";
    props.onCommit(nextText);
  }, [endIfNeeded, props]);

  const cancel = useCallback(() => {
    if (endedRef.current) return;
    endIfNeeded();
    props.onCancel();
  }, [endIfNeeded, props]);

  useLayoutEffect(() => {
    const el = elRef.current;
    if (!el) return;
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
  }, []);

  const onPastePlainText = useCallback((e: ClipboardEvent<HTMLElement>) => {
    const text = e.clipboardData.getData("text/plain");
    e.preventDefault();

    const el = elRef.current;
    if (!el) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
      el.textContent = `${el.textContent ?? ""}${text}`;
      return;
    }

    const range = sel.getRangeAt(0);
    range.deleteContents();

    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);

    sel.removeAllRanges();
    sel.addRange(range);
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
    <Tag
      ref={elRef as never}
      className={props.className}
      style={props.style}
      contentEditable={true}
      suppressContentEditableWarning={true}
      onBlur={commit}
      onKeyDown={onKeyDown}
      onPaste={onPastePlainText}
    >
      {props.text}
    </Tag>
  );
}
