import type { IdFactory, Document, Node } from "@/editor-core";
import { LATEST_SCHEMA_VERSION, createDefaultTheme, createNode } from "@/editor-core";

function collect(...ns: Node[]): Record<string, Node> {
  const out: Record<string, Node> = {};
  for (const n of ns) out[n.id] = n;
  return out;
}

export function createPortfolioTemplate(idFactory: IdFactory): Document {
  const now = new Date().toISOString();

  const page = createNode("page", { idFactory, props: { title: "Portfolio", lang: "en" } });

  // --- Hero section ---
  const heroSection = createNode("section", { idFactory, parentId: page.id, props: { variant: "hero", fullWidth: true } });
  const heroCols = createNode("columns", { idFactory, parentId: heroSection.id, props: { columns: 2, gap: "var(--space-8)" } });

  const heroColText = createNode("column", { idFactory, parentId: heroCols.id });
  const heroHeading = createNode("text", {
    idFactory,
    parentId: heroColText.id,
    props: { content: [{ text: "Hi, I'm Jordan Lee" }], as: "h1" },
    style: { base: { color: "var(--color-text)", marginBottom: "var(--space-3)" } },
  });
  const heroSubtext = createNode("text", {
    idFactory,
    parentId: heroColText.id,
    props: { content: [{ text: "Product designer and creative developer. I build digital experiences that are both beautiful and functional." }], as: "p" },
    style: { base: { color: "var(--color-text)", marginBottom: "var(--space-5)" } },
  });
  const heroCtaBtn = createNode("button", {
    idFactory,
    parentId: heroColText.id,
    props: { label: "View My Work", href: "#projects", variant: "primary" },
  });
  heroColText.children = [heroHeading.id, heroSubtext.id, heroCtaBtn.id];

  const heroColImage = createNode("column", { idFactory, parentId: heroCols.id });
  const heroImage = createNode("image", {
    idFactory,
    parentId: heroColImage.id,
    props: { src: "https://placehold.co/560x560/111827/ffffff?text=Profile+Photo", alt: "Profile photo of Jordan Lee", fit: "cover" },
    style: { base: { borderRadius: "50%" } },
  });
  heroColImage.children = [heroImage.id];
  heroCols.children = [heroColText.id, heroColImage.id];
  heroSection.children = [heroCols.id];

  // --- Project 1 (image left, text right) ---
  const proj1Section = createNode("section", { idFactory, parentId: page.id, props: { variant: "default", fullWidth: false } });
  const proj1Cols = createNode("columns", { idFactory, parentId: proj1Section.id, props: { columns: 2, gap: "var(--space-6)" } });

  const proj1ColImage = createNode("column", { idFactory, parentId: proj1Cols.id });
  const proj1Image = createNode("image", {
    idFactory,
    parentId: proj1ColImage.id,
    props: { src: "https://placehold.co/560x400/2563eb/ffffff?text=Project+One", alt: "Project One screenshot", fit: "cover" },
    style: { base: { borderRadius: "8px" } },
  });
  proj1ColImage.children = [proj1Image.id];

  const proj1ColText = createNode("column", { idFactory, parentId: proj1Cols.id });
  const proj1Title = createNode("text", {
    idFactory,
    parentId: proj1ColText.id,
    props: { content: [{ text: "Project One — Design System" }], as: "h3" },
    style: { base: { color: "var(--color-primary)", marginBottom: "var(--space-2)" } },
  });
  const proj1Body = createNode("text", {
    idFactory,
    parentId: proj1ColText.id,
    props: { content: [{ text: "A comprehensive design system built for a SaaS product with 20+ reusable components, tokens, and usage guidelines. Reduced design-to-dev handoff time by 40%." }], as: "p" },
    style: { base: { marginBottom: "var(--space-4)" } },
  });
  const proj1Btn = createNode("button", {
    idFactory,
    parentId: proj1ColText.id,
    props: { label: "View Case Study", href: "#", variant: "secondary" },
  });
  proj1ColText.children = [proj1Title.id, proj1Body.id, proj1Btn.id];
  proj1Cols.children = [proj1ColImage.id, proj1ColText.id];
  proj1Section.children = [proj1Cols.id];

  // --- Project 2 (text left, image right) ---
  const proj2Section = createNode("section", { idFactory, parentId: page.id, props: { variant: "default", fullWidth: false } });
  const proj2Cols = createNode("columns", { idFactory, parentId: proj2Section.id, props: { columns: 2, gap: "var(--space-6)" } });

  const proj2ColText = createNode("column", { idFactory, parentId: proj2Cols.id });
  const proj2Title = createNode("text", {
    idFactory,
    parentId: proj2ColText.id,
    props: { content: [{ text: "Project Two — Mobile App" }], as: "h3" },
    style: { base: { color: "var(--color-primary)", marginBottom: "var(--space-2)" } },
  });
  const proj2Body = createNode("text", {
    idFactory,
    parentId: proj2ColText.id,
    props: { content: [{ text: "End-to-end UX design for a health-tracking mobile app. Conducted user research, created wireframes, and delivered a polished prototype that shipped to 10,000+ users." }], as: "p" },
    style: { base: { marginBottom: "var(--space-4)" } },
  });
  const proj2Btn = createNode("button", {
    idFactory,
    parentId: proj2ColText.id,
    props: { label: "View Case Study", href: "#", variant: "secondary" },
  });
  proj2ColText.children = [proj2Title.id, proj2Body.id, proj2Btn.id];

  const proj2ColImage = createNode("column", { idFactory, parentId: proj2Cols.id });
  const proj2Image = createNode("image", {
    idFactory,
    parentId: proj2ColImage.id,
    props: { src: "https://placehold.co/560x400/111827/ffffff?text=Project+Two", alt: "Project Two screenshot", fit: "cover" },
    style: { base: { borderRadius: "8px" } },
  });
  proj2ColImage.children = [proj2Image.id];
  proj2Cols.children = [proj2ColText.id, proj2ColImage.id];
  proj2Section.children = [proj2Cols.id];

  // --- About section ---
  const aboutSection = createNode("section", { idFactory, parentId: page.id, props: { variant: "default", fullWidth: false } });
  const aboutCols = createNode("columns", { idFactory, parentId: aboutSection.id, props: { columns: 2, gap: "var(--space-8)" } });

  const aboutColText = createNode("column", { idFactory, parentId: aboutCols.id });
  const aboutHeading = createNode("text", {
    idFactory,
    parentId: aboutColText.id,
    props: { content: [{ text: "About Me" }], as: "h2" },
    style: { base: { color: "var(--color-text)", marginBottom: "var(--space-3)" } },
  });
  const aboutBody1 = createNode("text", {
    idFactory,
    parentId: aboutColText.id,
    props: { content: [{ text: "I'm a passionate designer with 8+ years of experience creating digital products for startups and Fortune 500 companies alike." }], as: "p" },
    style: { base: { marginBottom: "var(--space-3)" } },
  });
  const aboutBody2 = createNode("text", {
    idFactory,
    parentId: aboutColText.id,
    props: { content: [{ text: "When I'm not designing, you'll find me hiking, shooting film photography, or experimenting with creative coding." }], as: "p" },
  });
  aboutColText.children = [aboutHeading.id, aboutBody1.id, aboutBody2.id];

  const aboutColSpacer = createNode("column", { idFactory, parentId: aboutCols.id });
  aboutCols.children = [aboutColText.id, aboutColSpacer.id];
  aboutSection.children = [aboutCols.id];

  page.children = [heroSection.id, proj1Section.id, proj2Section.id, aboutSection.id];

  return {
    meta: { schemaVersion: LATEST_SCHEMA_VERSION, createdAt: now, updatedAt: now, title: "Portfolio" },
    theme: createDefaultTheme(),
    rootId: page.id,
    nodes: collect(
      page,
      heroSection, heroCols, heroColText, heroHeading, heroSubtext, heroCtaBtn, heroColImage, heroImage,
      proj1Section, proj1Cols, proj1ColImage, proj1Image, proj1ColText, proj1Title, proj1Body, proj1Btn,
      proj2Section, proj2Cols, proj2ColText, proj2Title, proj2Body, proj2Btn, proj2ColImage, proj2Image,
      aboutSection, aboutCols, aboutColText, aboutHeading, aboutBody1, aboutBody2, aboutColSpacer,
    ),
  };
}
