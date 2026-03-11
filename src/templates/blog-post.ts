import type { IdFactory, Document, Node } from "@/editor-core";
import { LATEST_SCHEMA_VERSION, createDefaultTheme, createNode } from "@/editor-core";

function collect(...ns: Node[]): Record<string, Node> {
  const out: Record<string, Node> = {};
  for (const n of ns) out[n.id] = n;
  return out;
}

export function createBlogPostTemplate(idFactory: IdFactory): Document {
  const now = new Date().toISOString();

  const page = createNode("page", { idFactory, props: { title: "Blog Post", lang: "en" } });

  // --- Article section ---
  const articleSection = createNode("section", { idFactory, parentId: page.id, props: { variant: "default", fullWidth: false } });
  const articleCols = createNode("columns", { idFactory, parentId: articleSection.id, props: { columns: 2, gap: "var(--space-8)" } });

  const articleColMain = createNode("column", { idFactory, parentId: articleCols.id });

  const articleTitle = createNode("text", {
    idFactory,
    parentId: articleColMain.id,
    props: { content: [{ text: "The Future of Web Design is Here" }], as: "h1" },
    style: { base: { color: "var(--color-text)", marginBottom: "var(--space-2)" } },
  });
  const articleSubtitle = createNode("text", {
    idFactory,
    parentId: articleColMain.id,
    props: { content: [{ text: "How modern no-code tools are reshaping how teams build digital experiences" }], as: "h3" },
    style: { base: { color: "var(--color-text)", marginBottom: "var(--space-5)" } },
  });
  const articleDivider = createNode("divider", {
    idFactory,
    parentId: articleColMain.id,
    props: { thickness: "1px", color: "var(--color-border)" },
    style: { base: { marginBottom: "var(--space-5)" } },
  });
  const articleBody1 = createNode("text", {
    idFactory,
    parentId: articleColMain.id,
    props: { content: [{ text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat." }], as: "p" },
    style: { base: { marginBottom: "var(--space-4)" } },
  });
  const articleBody2 = createNode("text", {
    idFactory,
    parentId: articleColMain.id,
    props: { content: [{ text: "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium." }], as: "p" },
    style: { base: { marginBottom: "var(--space-4)" } },
  });
  const articleSubheading = createNode("text", {
    idFactory,
    parentId: articleColMain.id,
    props: { content: [{ text: "Why This Matters Now" }], as: "h2" },
    style: { base: { color: "var(--color-text)", marginBottom: "var(--space-3)" } },
  });
  const articleBody3 = createNode("text", {
    idFactory,
    parentId: articleColMain.id,
    props: { content: [{ text: "At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident, similique sunt in culpa qui officia deserunt mollitia animi." }], as: "p" },
  });
  articleColMain.children = [articleTitle.id, articleSubtitle.id, articleDivider.id, articleBody1.id, articleBody2.id, articleSubheading.id, articleBody3.id];

  const articleColSpacer = createNode("column", { idFactory, parentId: articleCols.id });
  articleCols.children = [articleColMain.id, articleColSpacer.id];
  articleSection.children = [articleCols.id];

  // --- Author section ---
  const authorSection = createNode("section", { idFactory, parentId: page.id, props: { variant: "default", fullWidth: false } });
  const authorCols = createNode("columns", { idFactory, parentId: authorSection.id, props: { columns: 2, gap: "var(--space-6)" } });

  const authorColImage = createNode("column", { idFactory, parentId: authorCols.id });
  const authorImage = createNode("image", {
    idFactory,
    parentId: authorColImage.id,
    props: { src: "https://placehold.co/160x160/111827/ffffff?text=Author", alt: "Author portrait", fit: "cover" },
    style: { base: { borderRadius: "50%" } },
  });
  authorColImage.children = [authorImage.id];

  const authorColBio = createNode("column", { idFactory, parentId: authorCols.id });
  const authorName = createNode("text", {
    idFactory,
    parentId: authorColBio.id,
    props: { content: [{ text: "Sam Rivera", bold: true }], as: "h3" },
    style: { base: { color: "var(--color-text)", marginBottom: "var(--space-2)" } },
  });
  const authorBio = createNode("text", {
    idFactory,
    parentId: authorColBio.id,
    props: { content: [{ text: "Sam is a senior content strategist with a decade of experience writing about design, technology, and the future of work." }], as: "p" },
  });
  authorColBio.children = [authorName.id, authorBio.id];

  authorCols.children = [authorColImage.id, authorColBio.id];
  authorSection.children = [authorCols.id];

  page.children = [articleSection.id, authorSection.id];

  return {
    meta: { schemaVersion: LATEST_SCHEMA_VERSION, createdAt: now, updatedAt: now, title: "Blog Post" },
    theme: createDefaultTheme(),
    rootId: page.id,
    nodes: collect(
      page,
      articleSection, articleCols, articleColMain,
      articleTitle, articleSubtitle, articleDivider, articleBody1, articleBody2, articleSubheading, articleBody3,
      articleColSpacer,
      authorSection, authorCols, authorColImage, authorImage, authorColBio, authorName, authorBio,
    ),
  };
}
