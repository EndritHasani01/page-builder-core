import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { createDefaultDocument, createDeterministicIdFactory, createNode } from "@/editor-core";

import { RenderDocument } from "./RenderDocument";

describe("RenderDocument", () => {
  test("hidden nodes render only in editor mode", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const idFactory = createDeterministicIdFactory();

    const hiddenText = createNode("text", {
      idFactory,
      parentId: "column_1",
      props: { text: "Secret" },
      constraints: { hidden: true },
    });

    doc.nodes[hiddenText.id] = hiddenText;
    doc.nodes["column_1"].children = [hiddenText.id];

    const { rerender } = render(
      <RenderDocument doc={doc} mode="editor" breakpoint="lg" selectedId={hiddenText.id} />,
    );
    expect(screen.getByText("Secret")).toBeInTheDocument();
    expect(screen.getByText("Hidden")).toBeInTheDocument();

    rerender(<RenderDocument doc={doc} mode="preview" breakpoint="lg" />);
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();

    rerender(<RenderDocument doc={doc} mode="export" breakpoint="lg" />);
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });

  test("data-node-id is only emitted in editor mode", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const idFactory = createDeterministicIdFactory();

    const text = createNode("text", { idFactory, parentId: "column_1", props: { text: "Hello" } });
    doc.nodes[text.id] = text;
    doc.nodes["column_1"].children = [text.id];

    const { container, rerender } = render(<RenderDocument doc={doc} mode="editor" breakpoint="lg" />);
    expect(container.querySelector(`[data-node-id="${text.id}"]`)).toBeInTheDocument();

    rerender(<RenderDocument doc={doc} mode="preview" breakpoint="lg" />);
    expect(container.querySelector(`[data-node-id="${text.id}"]`)).not.toBeInTheDocument();

    rerender(<RenderDocument doc={doc} mode="export" breakpoint="lg" />);
    expect(container.querySelector(`[data-node-id="${text.id}"]`)).not.toBeInTheDocument();
  });

  test("preview disableNavigation prevents default for links", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const idFactory = createDeterministicIdFactory();

    const safeButton = createNode("button", {
      idFactory,
      parentId: "column_1",
      props: { label: "Go", href: "https://example.com" },
    });

    const unsafeButton = createNode("button", {
      idFactory,
      parentId: "column_1",
      props: { label: "Unsafe", href: "javascript:alert(1)" },
    });

    const image = createNode("image", {
      idFactory,
      parentId: "column_1",
      props: {
        src: "https://example.com/image.png",
        alt: "Linked image",
        fit: "cover",
        linkTo: "https://example.com",
      },
    });

    doc.nodes[safeButton.id] = safeButton;
    doc.nodes[unsafeButton.id] = unsafeButton;
    doc.nodes[image.id] = image;
    doc.nodes["column_1"].children = [safeButton.id, unsafeButton.id, image.id];

    const { container, rerender } = render(
      <RenderDocument doc={doc} mode="preview" breakpoint="lg" disableNavigation />,
    );

    const safeLink = screen.getByRole("link", { name: "Go" });
    const imageLink = screen.getByRole("link", { name: "Linked image" });

    const ev1 = new MouseEvent("click", { bubbles: true, cancelable: true });
    expect(safeLink.dispatchEvent(ev1)).toBe(false);
    expect(ev1.defaultPrevented).toBe(true);

    const ev2 = new MouseEvent("click", { bubbles: true, cancelable: true });
    expect(imageLink.dispatchEvent(ev2)).toBe(false);
    expect(ev2.defaultPrevented).toBe(true);

    expect(screen.queryByRole("link", { name: "Unsafe" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unsafe" })).toBeInTheDocument();

    rerender(<RenderDocument doc={doc} mode="preview" breakpoint="lg" disableNavigation={false} />);

    const safeLink2 = screen.getByRole("link", { name: "Go" });
    let preventedBeforeTestListener = true;
    const onClick = (e: MouseEvent) => {
      if (e.target !== safeLink2) return;
      preventedBeforeTestListener = e.defaultPrevented;
      e.preventDefault();
    };

    container.addEventListener("click", onClick);
    safeLink2.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    container.removeEventListener("click", onClick);

    expect(preventedBeforeTestListener).toBe(false);
  });
});
