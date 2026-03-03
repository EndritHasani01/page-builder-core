export type VideoInfo = {
  platform: "youtube" | "vimeo";
  id: string;
};

/**
 * Parses a YouTube or Vimeo URL and extracts the platform and video ID.
 * Returns null for unrecognized URLs.
 *
 * Supported patterns:
 *   YouTube: https://youtube.com/watch?v=ID, https://youtu.be/ID, https://youtube.com/embed/ID
 *   Vimeo:   https://vimeo.com/ID
 */
export function parseVideoUrl(url: string): VideoInfo | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, "");

    // YouTube: youtube.com/watch?v=ID
    if (host === "youtube.com") {
      const v = parsed.searchParams.get("v");
      if (v) return { platform: "youtube", id: v };
      // youtube.com/embed/ID
      const embedMatch = parsed.pathname.match(/^\/embed\/([^/?#]+)/);
      if (embedMatch) return { platform: "youtube", id: embedMatch[1] };
    }

    // YouTube: youtu.be/ID
    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1).split("?")[0].split("#")[0];
      if (id) return { platform: "youtube", id };
    }

    // Vimeo: vimeo.com/ID
    if (host === "vimeo.com") {
      const pathMatch = parsed.pathname.match(/^\/(\d+)/);
      if (pathMatch) return { platform: "vimeo", id: pathMatch[1] };
    }

    return null;
  } catch {
    return null;
  }
}

/** Builds the embed iframe src URL from a parsed VideoInfo. */
export function buildVideoEmbedUrl(info: VideoInfo, autoplay: boolean, loop: boolean): string {
  const params = new URLSearchParams();
  if (autoplay) params.set("autoplay", "1");
  if (loop) {
    params.set("loop", "1");
    if (info.platform === "youtube") params.set("playlist", info.id);
  }
  const qs = params.toString();

  if (info.platform === "youtube") {
    return `https://www.youtube.com/embed/${info.id}${qs ? `?${qs}` : ""}`;
  } else {
    return `https://player.vimeo.com/video/${info.id}${qs ? `?${qs}` : ""}`;
  }
}

/** Returns the thumbnail URL for a YouTube video, or null for Vimeo (requires API). */
export function getVideoThumbnailUrl(info: VideoInfo): string | null {
  if (info.platform === "youtube") {
    return `https://img.youtube.com/vi/${info.id}/mqdefault.jpg`;
  }
  return null;
}

/**
 * Whitelisted embed domains for the generic Embed block.
 * Arbitrary iframes are blocked to prevent XSS and phishing.
 */
export const SAFE_EMBED_DOMAINS = new Set([
  "youtube.com",
  "www.youtube.com",
  "player.vimeo.com",
  "google.com",
  "maps.google.com",
  "codepen.io",
  "figma.com",
  "open.spotify.com",
  "twitter.com",
  "x.com",
]);

/** Returns true if the URL's hostname is in the SAFE_EMBED_DOMAINS whitelist. */
export function isSafeEmbedDomain(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return SAFE_EMBED_DOMAINS.has(parsed.hostname);
  } catch {
    return false;
  }
}
