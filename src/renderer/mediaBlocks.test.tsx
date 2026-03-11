import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { createDefaultDocument, createDeterministicIdFactory, createNode } from "@/editor-core";
import type { Node } from "@/editor-core";

import { RenderDocument } from "./RenderDocument";

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildDocWithNode(type: "video" | "embed" | "icon", props: Record<string, unknown>) {
  const doc = createDefaultDocument(new Date("2026-03-03T12:00:00.000Z"));
  const idFactory = createDeterministicIdFactory();

  const node = createNode(type as never, {
    idFactory,
    parentId: "column_1",
    props: props as never,
  }) as unknown as Node;

  doc.nodes[node.id] = node;
  doc.nodes["column_1"] = { ...doc.nodes["column_1"]!, children: [node.id] };

  return { doc, nodeId: node.id };
}

// ─── video block rendering ────────────────────────────────────────────────────

describe("video block — RenderDocument", () => {
  test("preview mode renders responsive iframe for YouTube URL", () => {
    const { doc } = buildDocWithNode("video", {
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      aspectRatio: "16:9",
      autoplay: false,
      loop: false,
    });

    const { container } = render(<RenderDocument doc={doc} mode="preview" breakpoint="lg" />);
    const iframe = container.querySelector("iframe");
    expect(iframe).toBeInTheDocument();
    expect(iframe?.getAttribute("src")).toContain("youtube.com/embed/dQw4w9WgXcQ");
    expect(iframe?.getAttribute("allowfullscreen")).not.toBeNull();
  });

  test("preview mode renders responsive iframe for Vimeo URL", () => {
    const { doc } = buildDocWithNode("video", {
      url: "https://vimeo.com/123456789",
      aspectRatio: "4:3",
      autoplay: false,
      loop: false,
    });

    const { container } = render(<RenderDocument doc={doc} mode="preview" breakpoint="lg" />);
    const iframe = container.querySelector("iframe");
    expect(iframe).toBeInTheDocument();
    expect(iframe?.getAttribute("src")).toContain("player.vimeo.com/video/123456789");
  });

  test("preview mode includes autoplay param when autoplay=true", () => {
    const { doc } = buildDocWithNode("video", {
      url: "https://youtu.be/dQw4w9WgXcQ",
      aspectRatio: "16:9",
      autoplay: true,
      loop: false,
    });

    const { container } = render(<RenderDocument doc={doc} mode="preview" breakpoint="lg" />);
    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toContain("autoplay=1");
  });

  test("preview mode renders nothing (null output) for empty URL", () => {
    const { doc } = buildDocWithNode("video", {
      url: "",
      aspectRatio: "16:9",
      autoplay: false,
      loop: false,
    });

    const { container } = render(<RenderDocument doc={doc} mode="preview" breakpoint="lg" />);
    // No iframe rendered when URL is empty
    expect(container.querySelector("iframe")).toBeNull();
  });

  test("editor mode renders placeholder card (no iframe)", () => {
    const { doc } = buildDocWithNode("video", {
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      aspectRatio: "16:9",
      autoplay: false,
      loop: false,
    });

    const { container } = render(
      <RenderDocument doc={doc} mode="editor" breakpoint="lg" enableDnd={false} />,
    );

    // No live iframe in editor mode
    expect(container.querySelector("iframe")).toBeNull();
    // Platform label visible
    expect(container.textContent).toContain("YouTube");
  });

  test("export mode applies aspect ratio container via padding-bottom style", () => {
    const { doc } = buildDocWithNode("video", {
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      aspectRatio: "16:9",
      autoplay: false,
      loop: false,
    });

    const { container } = render(<RenderDocument doc={doc} mode="export" breakpoint="lg" />);
    const iframe = container.querySelector("iframe");
    const wrapper = iframe?.parentElement;
    expect(wrapper?.style.paddingBottom).toBe("56.25%");
  });
});

// ─── embed block rendering ────────────────────────────────────────────────────

describe("embed block — RenderDocument", () => {
  test("preview mode renders iframe for whitelisted domain", () => {
    const { doc } = buildDocWithNode("embed", {
      url: "https://codepen.io/user/pen/abc",
      width: "100%",
      height: "400px",
    });

    const { container } = render(<RenderDocument doc={doc} mode="preview" breakpoint="lg" />);
    const iframe = container.querySelector("iframe");
    expect(iframe).toBeInTheDocument();
    expect(iframe?.getAttribute("src")).toBe("https://codepen.io/user/pen/abc");
    expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin");
  });

  test("preview mode renders nothing for disallowed domain", () => {
    const { doc } = buildDocWithNode("embed", {
      url: "https://evil.example.com/page",
      width: "100%",
      height: "400px",
    });

    const { container } = render(<RenderDocument doc={doc} mode="preview" breakpoint="lg" />);
    expect(container.querySelector("iframe")).toBeNull();
  });

  test("editor mode renders placeholder with URL, not live iframe", () => {
    const { doc } = buildDocWithNode("embed", {
      url: "https://figma.com/embed?embed_host=share",
      width: "640px",
      height: "480px",
    });

    const { container } = render(
      <RenderDocument doc={doc} mode="editor" breakpoint="lg" enableDnd={false} />,
    );

    expect(container.querySelector("iframe")).toBeNull();
    expect(container.textContent).toContain("figma.com");
  });
});

// ─── icon block rendering ─────────────────────────────────────────────────────

describe("icon block — RenderDocument", () => {
  test("renders SVG with correct dimensions", () => {
    const { doc } = buildDocWithNode("icon", {
      icon: "star",
      size: 32,
      color: "#ff0000",
    });

    const { container } = render(<RenderDocument doc={doc} mode="preview" breakpoint="lg" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute("width")).toBe("32");
    expect(svg?.getAttribute("height")).toBe("32");
    expect(svg?.getAttribute("stroke")).toBe("#ff0000");
  });

  test("renders SVG in export mode", () => {
    const { doc } = buildDocWithNode("icon", {
      icon: "heart",
      size: 24,
      color: "currentColor",
    });

    const { container } = render(<RenderDocument doc={doc} mode="export" breakpoint="lg" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute("width")).toBe("24");
  });

  test("renders fallback placeholder svg for unknown icon name", () => {
    const { doc } = buildDocWithNode("icon", {
      icon: "this-icon-does-not-exist-xyz",
      size: 24,
      color: "currentColor",
    });

    const { container } = render(<RenderDocument doc={doc} mode="preview" breakpoint="lg" />);
    // Should render an SVG placeholder, not crash
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});

// ─── image enhancements rendering ────────────────────────────────────────────

describe("image block enhancements — RenderDocument", () => {
  function buildImageDoc(props: Record<string, unknown>) {
    const doc = createDefaultDocument(new Date("2026-03-03T12:00:00.000Z"));
    const idFactory = createDeterministicIdFactory();
    const node = createNode("image", {
      idFactory,
      parentId: "column_1",
      props: { src: "https://example.com/img.jpg", alt: "Test", fit: "cover", ...props } as never,
    });
    doc.nodes[node.id] = node;
    doc.nodes["column_1"] = { ...doc.nodes["column_1"]!, children: [node.id] };
    return { doc, nodeId: node.id };
  }

  test("applies borderRadius to img element", () => {
    const { doc } = buildImageDoc({ borderRadius: "md" });
    const { container } = render(<RenderDocument doc={doc} mode="export" breakpoint="lg" />);
    const img = container.querySelector("img");
    expect(img?.style.borderRadius).toBe("8px");
  });

  test("aspect ratio wrapper uses padding-bottom trick for 16:9", () => {
    const { doc } = buildImageDoc({ aspectRatio: "16:9" });
    const { container } = render(<RenderDocument doc={doc} mode="export" breakpoint="lg" />);
    const img = container.querySelector("img");
    const wrapper = img?.parentElement;
    expect(wrapper?.style.paddingBottom).toBe("56.25%");
  });

  test("aspect ratio 1:1 applies 100% padding-bottom", () => {
    const { doc } = buildImageDoc({ aspectRatio: "1:1" });
    const { container } = render(<RenderDocument doc={doc} mode="export" breakpoint="lg" />);
    const img = container.querySelector("img");
    const wrapper = img?.parentElement;
    expect(wrapper?.style.paddingBottom).toBe("100%");
  });

  test("no wrapper div when aspectRatio is auto", () => {
    const { doc } = buildImageDoc({ aspectRatio: "auto" });
    const { container } = render(<RenderDocument doc={doc} mode="export" breakpoint="lg" />);
    const img = container.querySelector("img");
    // Parent should not have paddingBottom set
    expect(img?.parentElement?.style.paddingBottom ?? "").toBe("");
  });
});
