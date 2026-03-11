import type { IdFactory, Document, Node } from "@/editor-core";
import { LATEST_SCHEMA_VERSION, createDefaultTheme, createNode } from "@/editor-core";

function collect(...ns: Node[]): Record<string, Node> {
  const out: Record<string, Node> = {};
  for (const n of ns) out[n.id] = n;
  return out;
}

export function createComingSoonTemplate(idFactory: IdFactory): Document {
  const now = new Date().toISOString();

  const page = createNode("page", { idFactory, props: { title: "Coming Soon", lang: "en" } });

  // --- Centered hero section ---
  const heroSection = createNode("section", { idFactory, parentId: page.id, props: { variant: "hero", fullWidth: true } });
  const heroCols = createNode("columns", { idFactory, parentId: heroSection.id, props: { columns: 2, gap: "var(--space-4)" } });

  const heroColMain = createNode("column", { idFactory, parentId: heroCols.id });

  const heroDividerTop = createNode("spacer", {
    idFactory,
    parentId: heroColMain.id,
    props: { height: "var(--space-10)" },
  });
  const heroHeading = createNode("text", {
    idFactory,
    parentId: heroColMain.id,
    props: { content: [{ text: "Coming Soon" }], as: "h1" },
    style: { base: { color: "var(--color-primary)", textAlign: "center", marginBottom: "var(--space-4)" } },
  });
  const heroSubtext = createNode("text", {
    idFactory,
    parentId: heroColMain.id,
    props: { content: [{ text: "Something exciting is on its way. We're working hard to bring you an amazing experience. Stay tuned!" }], as: "p" },
    style: { base: { color: "var(--color-text)", textAlign: "center", marginBottom: "var(--space-6)" } },
  });
  const heroButton = createNode("button", {
    idFactory,
    parentId: heroColMain.id,
    props: { label: "Notify Me", href: "#", variant: "primary" },
  });
  const heroDividerBottom = createNode("spacer", {
    idFactory,
    parentId: heroColMain.id,
    props: { height: "var(--space-10)" },
  });

  heroColMain.children = [heroDividerTop.id, heroHeading.id, heroSubtext.id, heroButton.id, heroDividerBottom.id];

  const heroColSpacer = createNode("column", { idFactory, parentId: heroCols.id });
  heroCols.children = [heroColMain.id, heroColSpacer.id];
  heroSection.children = [heroCols.id];

  page.children = [heroSection.id];

  return {
    meta: { schemaVersion: LATEST_SCHEMA_VERSION, createdAt: now, updatedAt: now, title: "Coming Soon" },
    theme: createDefaultTheme(),
    rootId: page.id,
    nodes: collect(
      page,
      heroSection, heroCols, heroColMain,
      heroDividerTop, heroHeading, heroSubtext, heroButton, heroDividerBottom,
      heroColSpacer,
    ),
  };
}
