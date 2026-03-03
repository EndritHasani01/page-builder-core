import type { IdFactory, Document, Node } from "@/editor-core";
import { LATEST_SCHEMA_VERSION, createDefaultTheme, createNode } from "@/editor-core";

function collect(...ns: Node[]): Record<string, Node> {
  const out: Record<string, Node> = {};
  for (const n of ns) out[n.id] = n;
  return out;
}

export function createLandingPageTemplate(idFactory: IdFactory): Document {
  const now = new Date().toISOString();

  const page = createNode("page", { idFactory, props: { title: "Landing Page", lang: "en" } });

  // --- Hero section ---
  const heroSection = createNode("section", { idFactory, parentId: page.id, props: { variant: "hero", fullWidth: true } });
  const heroCols = createNode("columns", { idFactory, parentId: heroSection.id, props: { columns: 2, gap: "var(--space-6)" } });

  const heroColContent = createNode("column", { idFactory, parentId: heroCols.id });
  const heroHeading = createNode("text", {
    idFactory,
    parentId: heroColContent.id,
    props: { content: [{ text: "Build Something Great" }], as: "h1" },
    style: { base: { fontSize: "var(--text-base)", fontWeight: 700, color: "var(--color-text)", marginBottom: "var(--space-3)" } },
  });
  const heroSubheading = createNode("text", {
    idFactory,
    parentId: heroColContent.id,
    props: { content: [{ text: "The all-in-one platform to design, build, and launch your next big idea. No coding required." }], as: "h3" },
    style: { base: { color: "var(--color-text)", marginBottom: "var(--space-5)" } },
  });
  const heroButton = createNode("button", {
    idFactory,
    parentId: heroColContent.id,
    props: { label: "Get Started Free", href: "#", variant: "primary" },
  });
  const heroButtonSecondary = createNode("button", {
    idFactory,
    parentId: heroColContent.id,
    props: { label: "See a Demo", href: "#", variant: "secondary" },
  });

  heroColContent.children = [heroHeading.id, heroSubheading.id, heroButton.id, heroButtonSecondary.id];

  const heroColImage = createNode("column", { idFactory, parentId: heroCols.id });
  const heroImage = createNode("image", {
    idFactory,
    parentId: heroColImage.id,
    props: { src: "https://placehold.co/600x400/2563eb/ffffff?text=Hero+Image", alt: "Product hero image", fit: "cover" },
    style: { base: { borderRadius: "8px" } },
  });
  heroColImage.children = [heroImage.id];

  heroCols.children = [heroColContent.id, heroColImage.id];
  heroSection.children = [heroCols.id];

  // --- Features section ---
  const featuresSection = createNode("section", { idFactory, parentId: page.id, props: { variant: "default", fullWidth: false } });
  const featuresCols = createNode("columns", { idFactory, parentId: featuresSection.id, props: { columns: 3, gap: "var(--space-6)" } });

  function makeFeatureCol(heading: string, body: string): { col: ReturnType<typeof createNode<"column">>; nodes: Node[] } {
    const col = createNode("column", { idFactory, parentId: featuresCols.id });
    const h = createNode("text", {
      idFactory,
      parentId: col.id,
      props: { content: [{ text: heading }], as: "h3" },
      style: { base: { color: "var(--color-primary)", marginBottom: "var(--space-2)" } },
    });
    const p = createNode("text", {
      idFactory,
      parentId: col.id,
      props: { content: [{ text: body }], as: "p" },
    });
    col.children = [h.id, p.id];
    return { col, nodes: [col, h, p] };
  }

  const f1 = makeFeatureCol("Lightning Fast", "Our platform is optimized for speed so your pages load instantly, even at scale.");
  const f2 = makeFeatureCol("No-Code Editor", "Drag and drop blocks to compose beautiful pages without writing a single line of code.");
  const f3 = makeFeatureCol("Export Anywhere", "Export clean HTML ready to deploy on any hosting platform with a single click.");

  featuresCols.children = [f1.col.id, f2.col.id, f3.col.id];
  featuresSection.children = [featuresCols.id];

  // --- Testimonial section ---
  const testimonialSection = createNode("section", { idFactory, parentId: page.id, props: { variant: "default", fullWidth: false } });
  const testimonialCols = createNode("columns", { idFactory, parentId: testimonialSection.id, props: { columns: 2, gap: "var(--space-8)" } });

  const testimonialColQuote = createNode("column", { idFactory, parentId: testimonialCols.id });
  const testimonialQuote = createNode("text", {
    idFactory,
    parentId: testimonialColQuote.id,
    props: { content: [{ text: "\"This tool transformed the way our team ships landing pages. We went from days to minutes.\"", italic: true }], as: "p" },
    style: { base: { fontSize: "var(--text-base)", color: "var(--color-text)" } },
  });
  const testimonialAuthor = createNode("text", {
    idFactory,
    parentId: testimonialColQuote.id,
    props: { content: [{ text: "— Alex Johnson, Head of Marketing at Acme Corp", bold: true }], as: "p" },
  });
  testimonialColQuote.children = [testimonialQuote.id, testimonialAuthor.id];

  const testimonialColSpacer = createNode("column", { idFactory, parentId: testimonialCols.id });
  testimonialCols.children = [testimonialColQuote.id, testimonialColSpacer.id];
  testimonialSection.children = [testimonialCols.id];

  // --- CTA section ---
  const ctaSection = createNode("section", { idFactory, parentId: page.id, props: { variant: "hero", fullWidth: true } });
  const ctaCols = createNode("columns", { idFactory, parentId: ctaSection.id, props: { columns: 2, gap: "var(--space-4)" } });

  const ctaColContent = createNode("column", { idFactory, parentId: ctaCols.id });
  const ctaHeading = createNode("text", {
    idFactory,
    parentId: ctaColContent.id,
    props: { content: [{ text: "Ready to Get Started?" }], as: "h2" },
    style: { base: { color: "var(--color-text)", marginBottom: "var(--space-4)" } },
  });
  const ctaButton = createNode("button", {
    idFactory,
    parentId: ctaColContent.id,
    props: { label: "Start for Free", href: "#", variant: "primary" },
  });
  ctaColContent.children = [ctaHeading.id, ctaButton.id];

  const ctaColSpacer = createNode("column", { idFactory, parentId: ctaCols.id });
  ctaCols.children = [ctaColContent.id, ctaColSpacer.id];
  ctaSection.children = [ctaCols.id];

  page.children = [heroSection.id, featuresSection.id, testimonialSection.id, ctaSection.id];

  return {
    meta: { schemaVersion: LATEST_SCHEMA_VERSION, createdAt: now, updatedAt: now, title: "Landing Page" },
    theme: createDefaultTheme(),
    rootId: page.id,
    nodes: collect(
      page,
      heroSection, heroCols, heroColContent, heroHeading, heroSubheading, heroButton, heroButtonSecondary,
      heroColImage, heroImage,
      featuresSection, featuresCols,
      ...f1.nodes, ...f2.nodes, ...f3.nodes,
      testimonialSection, testimonialCols, testimonialColQuote, testimonialQuote, testimonialAuthor, testimonialColSpacer,
      ctaSection, ctaCols, ctaColContent, ctaHeading, ctaButton, ctaColSpacer,
    ),
  };
}
