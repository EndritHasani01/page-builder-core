import { describe, expect, test } from "vitest";

import { blockRegistry, createDeterministicIdFactory, createNode } from "@/editor-core";
import {
  SAFE_EMBED_DOMAINS,
  buildVideoEmbedUrl,
  isSafeEmbedDomain,
  parseVideoUrl,
} from "@/editor-core/mediaUtils";

// ─── parseVideoUrl ────────────────────────────────────────────────────────────

describe("parseVideoUrl", () => {
  // YouTube patterns
  test("parses youtube.com/watch?v=ID", () => {
    const result = parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result).toEqual({ platform: "youtube", id: "dQw4w9WgXcQ" });
  });

  test("parses youtube.com without www", () => {
    const result = parseVideoUrl("https://youtube.com/watch?v=abc123");
    expect(result).toEqual({ platform: "youtube", id: "abc123" });
  });

  test("parses youtu.be short URL", () => {
    const result = parseVideoUrl("https://youtu.be/dQw4w9WgXcQ");
    expect(result).toEqual({ platform: "youtube", id: "dQw4w9WgXcQ" });
  });

  test("parses youtu.be URL with query params", () => {
    const result = parseVideoUrl("https://youtu.be/dQw4w9WgXcQ?si=abc");
    expect(result).toEqual({ platform: "youtube", id: "dQw4w9WgXcQ" });
  });

  test("parses youtube.com/embed/ID", () => {
    const result = parseVideoUrl("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(result).toEqual({ platform: "youtube", id: "dQw4w9WgXcQ" });
  });

  // Vimeo patterns
  test("parses vimeo.com/ID", () => {
    const result = parseVideoUrl("https://vimeo.com/123456789");
    expect(result).toEqual({ platform: "vimeo", id: "123456789" });
  });

  test("parses vimeo.com/ID with extra path segments", () => {
    const result = parseVideoUrl("https://vimeo.com/123456789/somekey");
    expect(result).toEqual({ platform: "vimeo", id: "123456789" });
  });

  // Invalid inputs
  test("returns null for empty string", () => {
    expect(parseVideoUrl("")).toBeNull();
  });

  test("returns null for whitespace", () => {
    expect(parseVideoUrl("   ")).toBeNull();
  });

  test("returns null for non-video youtube URL", () => {
    expect(parseVideoUrl("https://youtube.com/channel/UCabc")).toBeNull();
  });

  test("returns null for random https URL", () => {
    expect(parseVideoUrl("https://example.com/some/path")).toBeNull();
  });

  test("returns null for non-URL string", () => {
    expect(parseVideoUrl("not a url")).toBeNull();
  });

  test("returns null for javascript: protocol", () => {
    expect(parseVideoUrl("javascript:alert(1)")).toBeNull();
  });

  test("returns null for vimeo.com without numeric ID", () => {
    expect(parseVideoUrl("https://vimeo.com/channels/staffpicks")).toBeNull();
  });
});

// ─── buildVideoEmbedUrl ───────────────────────────────────────────────────────

describe("buildVideoEmbedUrl", () => {
  test("builds YouTube embed URL without params", () => {
    const url = buildVideoEmbedUrl({ platform: "youtube", id: "abc123" }, false, false);
    expect(url).toBe("https://www.youtube.com/embed/abc123");
  });

  test("builds YouTube embed URL with autoplay", () => {
    const url = buildVideoEmbedUrl({ platform: "youtube", id: "abc123" }, true, false);
    expect(url).toContain("autoplay=1");
  });

  test("builds YouTube embed URL with loop (includes playlist param)", () => {
    const url = buildVideoEmbedUrl({ platform: "youtube", id: "abc123" }, false, true);
    expect(url).toContain("loop=1");
    expect(url).toContain("playlist=abc123");
  });

  test("builds Vimeo embed URL without params", () => {
    const url = buildVideoEmbedUrl({ platform: "vimeo", id: "123456" }, false, false);
    expect(url).toBe("https://player.vimeo.com/video/123456");
  });

  test("builds Vimeo embed URL with autoplay and loop", () => {
    const url = buildVideoEmbedUrl({ platform: "vimeo", id: "123456" }, true, true);
    expect(url).toContain("autoplay=1");
    expect(url).toContain("loop=1");
  });
});

// ─── isSafeEmbedDomain ────────────────────────────────────────────────────────

describe("isSafeEmbedDomain", () => {
  test("allows youtube.com", () => {
    expect(isSafeEmbedDomain("https://youtube.com/embed/abc")).toBe(true);
  });

  test("allows www.youtube.com", () => {
    expect(isSafeEmbedDomain("https://www.youtube.com/embed/abc")).toBe(true);
  });

  test("allows player.vimeo.com", () => {
    expect(isSafeEmbedDomain("https://player.vimeo.com/video/123456")).toBe(true);
  });

  test("allows google.com (maps)", () => {
    expect(isSafeEmbedDomain("https://google.com/maps/embed?pb=...")).toBe(true);
  });

  test("allows maps.google.com", () => {
    expect(isSafeEmbedDomain("https://maps.google.com/maps?q=...")).toBe(true);
  });

  test("allows codepen.io", () => {
    expect(isSafeEmbedDomain("https://codepen.io/user/pen/abc")).toBe(true);
  });

  test("allows figma.com", () => {
    expect(isSafeEmbedDomain("https://figma.com/embed?embed_host=share&url=...")).toBe(true);
  });

  test("allows open.spotify.com", () => {
    expect(isSafeEmbedDomain("https://open.spotify.com/embed/track/abc")).toBe(true);
  });

  test("allows twitter.com", () => {
    expect(isSafeEmbedDomain("https://twitter.com/some/path")).toBe(true);
  });

  test("allows x.com", () => {
    expect(isSafeEmbedDomain("https://x.com/some/path")).toBe(true);
  });

  test("rejects arbitrary domain", () => {
    expect(isSafeEmbedDomain("https://evil.example.com/payload")).toBe(false);
  });

  test("rejects phishing lookalike", () => {
    expect(isSafeEmbedDomain("https://youtube.com.evil.com/embed/abc")).toBe(false);
  });

  test("rejects javascript: protocol", () => {
    expect(isSafeEmbedDomain("javascript:alert(1)")).toBe(false);
  });

  test("rejects empty string", () => {
    expect(isSafeEmbedDomain("")).toBe(false);
  });
});

// ─── SAFE_EMBED_DOMAINS set ───────────────────────────────────────────────────

describe("SAFE_EMBED_DOMAINS", () => {
  test("contains expected entries", () => {
    expect(SAFE_EMBED_DOMAINS.has("youtube.com")).toBe(true);
    expect(SAFE_EMBED_DOMAINS.has("codepen.io")).toBe(true);
    expect(SAFE_EMBED_DOMAINS.has("figma.com")).toBe(true);
  });
});

// ─── video block registry ─────────────────────────────────────────────────────

describe("video block", () => {
  test("default props have correct shape", () => {
    const def = blockRegistry.video;
    expect(def.defaultProps.url).toBe("");
    expect(def.defaultProps.aspectRatio).toBe("16:9");
    expect(def.defaultProps.autoplay).toBe(false);
    expect(def.defaultProps.loop).toBe(false);
  });

  test("validate passes for empty URL", () => {
    const idFactory = createDeterministicIdFactory("video-test");
    const node = createNode("video", { idFactory, parentId: "col1", props: { url: "", aspectRatio: "16:9", autoplay: false, loop: false } });
    const issues = blockRegistry.video.validate!(node as never, { doc: {} as never });
    expect(issues).toHaveLength(0);
  });

  test("validate warns for non-video URL", () => {
    const idFactory = createDeterministicIdFactory("video-test2");
    const node = createNode("video", { idFactory, parentId: "col1", props: { url: "https://example.com/notavideo", aspectRatio: "16:9", autoplay: false, loop: false } });
    const issues = blockRegistry.video.validate!(node as never, { doc: {} as never });
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("warning");
    expect(issues[0].fieldPath).toBe("props.url");
  });

  test("validate passes for valid YouTube URL", () => {
    const idFactory = createDeterministicIdFactory("video-test3");
    const node = createNode("video", { idFactory, parentId: "col1", props: { url: "https://youtube.com/watch?v=dQw4w9WgXcQ", aspectRatio: "16:9", autoplay: false, loop: false } });
    const issues = blockRegistry.video.validate!(node as never, { doc: {} as never });
    expect(issues).toHaveLength(0);
  });

  test("validate passes for valid Vimeo URL", () => {
    const idFactory = createDeterministicIdFactory("video-test4");
    const node = createNode("video", { idFactory, parentId: "col1", props: { url: "https://vimeo.com/123456789", aspectRatio: "4:3", autoplay: false, loop: false } });
    const issues = blockRegistry.video.validate!(node as never, { doc: {} as never });
    expect(issues).toHaveLength(0);
  });

  test("inspector has url, aspectRatio, autoplay, loop fields", () => {
    const fields = blockRegistry.video.inspector!.groups.flatMap((g) => g.fields);
    expect(fields.some((f) => f.path === "props.url")).toBe(true);
    expect(fields.some((f) => f.path === "props.aspectRatio" && f.kind === "select")).toBe(true);
    expect(fields.some((f) => f.path === "props.autoplay" && f.kind === "toggle")).toBe(true);
    expect(fields.some((f) => f.path === "props.loop" && f.kind === "toggle")).toBe(true);
  });
});

// ─── embed block registry ─────────────────────────────────────────────────────

describe("embed block", () => {
  test("validate passes for empty URL", () => {
    const idFactory = createDeterministicIdFactory("embed-test");
    const node = createNode("embed", { idFactory, parentId: "col1", props: { url: "", width: "100%", height: "400px" } });
    const issues = blockRegistry.embed.validate!(node as never, { doc: {} as never });
    expect(issues).toHaveLength(0);
  });

  test("validate errors for disallowed domain", () => {
    const idFactory = createDeterministicIdFactory("embed-test2");
    const node = createNode("embed", { idFactory, parentId: "col1", props: { url: "https://evil.example.com/page", width: "100%", height: "400px" } });
    const issues = blockRegistry.embed.validate!(node as never, { doc: {} as never });
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("error");
    expect(issues[0].fieldPath).toBe("props.url");
  });

  test("validate passes for allowed domain (codepen.io)", () => {
    const idFactory = createDeterministicIdFactory("embed-test3");
    const node = createNode("embed", { idFactory, parentId: "col1", props: { url: "https://codepen.io/user/pen/abc", width: "100%", height: "400px" } });
    const issues = blockRegistry.embed.validate!(node as never, { doc: {} as never });
    expect(issues).toHaveLength(0);
  });
});

// ─── icon block registry ──────────────────────────────────────────────────────

describe("icon block", () => {
  test("default props have correct shape", () => {
    const def = blockRegistry.icon;
    expect(def.defaultProps.icon).toBe("star");
    expect(def.defaultProps.size).toBe(24);
    expect(def.defaultProps.color).toBe("currentColor");
  });

  test("inspector has icon-picker, size, color fields", () => {
    const fields = blockRegistry.icon.inspector!.groups.flatMap((g) => g.fields);
    expect(fields.some((f) => f.path === "props.icon" && f.kind === "icon-picker")).toBe(true);
    expect(fields.some((f) => f.path === "props.size" && f.kind === "number")).toBe(true);
    expect(fields.some((f) => f.path === "props.color" && f.kind === "color")).toBe(true);
  });

  test("is a leaf node (no children allowed)", () => {
    expect(blockRegistry.icon.allowedChildren).toHaveLength(0);
  });
});

// ─── image block enhancements ─────────────────────────────────────────────────

describe("image block enhancements", () => {
  test("default props include borderRadius and aspectRatio", () => {
    const def = blockRegistry.image;
    expect((def.defaultProps as Record<string, unknown>).borderRadius).toBe("none");
    expect((def.defaultProps as Record<string, unknown>).aspectRatio).toBe("auto");
  });

  test("inspector has borderRadius select field", () => {
    const fields = blockRegistry.image.inspector!.groups.flatMap((g) => g.fields);
    const brField = fields.find((f) => f.path === "props.borderRadius");
    expect(brField).toBeDefined();
    expect(brField?.kind).toBe("select");
  });

  test("inspector has aspectRatio select field", () => {
    const fields = blockRegistry.image.inspector!.groups.flatMap((g) => g.fields);
    const arField = fields.find((f) => f.path === "props.aspectRatio");
    expect(arField).toBeDefined();
    expect(arField?.kind).toBe("select");
  });

  test("fit field includes 'fill' option", () => {
    const fields = blockRegistry.image.inspector!.groups.flatMap((g) => g.fields);
    const fitField = fields.find((f) => f.path === "props.fit");
    expect(fitField?.kind).toBe("select");
    if (fitField?.kind === "select") {
      expect(fitField.options.some((o) => o.value === "fill")).toBe(true);
    }
  });
});

// ─── DnD allowedChildren ──────────────────────────────────────────────────────

describe("DnD allowedChildren includes new media types", () => {
  const mediaTypes = ["video", "embed", "icon"] as const;

  for (const type of mediaTypes) {
    test(`column accepts ${type}`, () => {
      expect(blockRegistry.column.allowedChildren).toContain(type);
    });

    test(`container accepts ${type}`, () => {
      expect(blockRegistry.container.allowedChildren).toContain(type);
    });
  }
});
