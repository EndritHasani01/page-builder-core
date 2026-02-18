import type { CSSProperties, MouseEvent } from "react";
import { memo, useMemo } from "react";

import type { Breakpoint, Document, Node, NodeId } from "@/editor-core";
import { blockRegistry, isProbablySafeUrl } from "@/editor-core";

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
      <NodeRenderer nodeId={props.doc.rootId} {...props} />
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
    onSelectNode,
    onMouseEnter,
    onMouseLeave,
    children,
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
  onSelectNode?: (e: MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children: React.ReactNode;
}) {
  const { node, mode, breakpoint } = args;

  switch (node.type) {
    case "page": {
      const intrinsic: CSSProperties = { minHeight: "100%" };
      const style = mergeCss(intrinsic, args.nodeStyle);
      return (
        <div
          lang={node.props.lang}
          {...args.dataAttrs}
          className={args.chromeClassName}
          style={style}
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
      const style = mergeCss(intrinsic, args.nodeStyle);
      return (
        <section
          {...args.dataAttrs}
          className={args.chromeClassName}
          style={style}
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
      };
      const style = mergeCss(intrinsic, args.nodeStyle);
      return (
        <div
          {...args.dataAttrs}
          className={args.chromeClassName}
          style={style}
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
      };
      const style = mergeCss(intrinsic, args.nodeStyle);
      return (
        <div
          {...args.dataAttrs}
          className={args.chromeClassName}
          style={style}
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
      const style = mergeCss(undefined, args.nodeStyle);
      return (
        <Tag
          {...args.dataAttrs}
          className={args.chromeClassName}
          style={style}
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

      const wrapperClassName =
        Tag === "span"
          ? [styles.wrapped, styles.wrappedInline].join(" ")
          : styles.wrapped;

      return (
        <div
          {...args.dataAttrs}
          className={wrapperClassName}
          onClick={args.onSelectNode}
          onMouseEnter={args.onMouseEnter}
          onMouseLeave={args.onMouseLeave}
        >
          {args.chrome}
          <Tag className={args.chromeClassName} style={args.nodeStyle}>
            {node.props.text}
          </Tag>
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
      const style = mergeCss(intrinsic, args.nodeStyle);
      return (
        <div
          {...args.dataAttrs}
          className={args.chromeClassName}
          style={style}
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
        <div {...args.dataAttrs} className={styles.wrapped} onClick={args.onSelectNode} onMouseEnter={args.onMouseEnter} onMouseLeave={args.onMouseLeave}>
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
