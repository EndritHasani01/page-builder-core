import { describe, expect, test } from "vitest";
import { createDeterministicIdFactory, validateDocument } from "@/editor-core";
import { TEMPLATES } from "@/templates";
import { createBlankTemplate } from "@/templates/blank";
import { createLandingPageTemplate } from "@/templates/landing-page";
import { createPortfolioTemplate } from "@/templates/portfolio";
import { createBlogPostTemplate } from "@/templates/blog-post";
import { createPricingTemplate } from "@/templates/pricing";
import { createComingSoonTemplate } from "@/templates/coming-soon";

describe("TEMPLATES registry", () => {
  test("exports 6 templates", () => {
    expect(TEMPLATES).toHaveLength(6);
  });

  test("first template is 'blank'", () => {
    expect(TEMPLATES[0]?.id).toBe("blank");
  });

  test("all templates have required fields", () => {
    for (const tmpl of TEMPLATES) {
      expect(typeof tmpl.id).toBe("string");
      expect(tmpl.id.length).toBeGreaterThan(0);
      expect(typeof tmpl.name).toBe("string");
      expect(tmpl.name.length).toBeGreaterThan(0);
      expect(typeof tmpl.description).toBe("string");
      expect(tmpl.description.length).toBeGreaterThan(0);
      expect(typeof tmpl.create).toBe("function");
    }
  });
});

describe("createBlankTemplate", () => {
  test("produces a valid document with no errors", () => {
    const idFactory = createDeterministicIdFactory();
    const doc = createBlankTemplate(idFactory);
    const issues = validateDocument(doc);
    const errors = issues.filter((i) => i.level === "error");
    expect(errors).toHaveLength(0);
  });

  test("document title is 'Blank Page'", () => {
    const doc = createBlankTemplate(createDeterministicIdFactory());
    expect(doc.meta.title).toBe("Blank Page");
  });

  test("document has a page root node", () => {
    const doc = createBlankTemplate(createDeterministicIdFactory());
    const root = doc.nodes[doc.rootId];
    expect(root?.type).toBe("page");
  });

  test("document has at least one section", () => {
    const doc = createBlankTemplate(createDeterministicIdFactory());
    const nodes = Object.values(doc.nodes);
    const sections = nodes.filter((n) => n.type === "section");
    expect(sections.length).toBeGreaterThanOrEqual(1);
  });
});

describe("createLandingPageTemplate", () => {
  test("produces a valid document with no errors", () => {
    const doc = createLandingPageTemplate(createDeterministicIdFactory());
    const issues = validateDocument(doc);
    const errors = issues.filter((i) => i.level === "error");
    expect(errors).toHaveLength(0);
  });

  test("document title is 'Landing Page'", () => {
    const doc = createLandingPageTemplate(createDeterministicIdFactory());
    expect(doc.meta.title).toBe("Landing Page");
  });

  test("contains hero section with h1 heading", () => {
    const doc = createLandingPageTemplate(createDeterministicIdFactory());
    const textNodes = Object.values(doc.nodes).filter((n) => n.type === "text");
    const h1Nodes = textNodes.filter((n) => n.type === "text" && (n.props as { as?: string }).as === "h1");
    expect(h1Nodes.length).toBeGreaterThanOrEqual(1);
  });

  test("contains buttons", () => {
    const doc = createLandingPageTemplate(createDeterministicIdFactory());
    const buttons = Object.values(doc.nodes).filter((n) => n.type === "button");
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  test("has at least 4 sections", () => {
    const doc = createLandingPageTemplate(createDeterministicIdFactory());
    const sections = Object.values(doc.nodes).filter((n) => n.type === "section");
    expect(sections.length).toBeGreaterThanOrEqual(4);
  });
});

describe("createPortfolioTemplate", () => {
  test("produces a valid document with no errors", () => {
    const doc = createPortfolioTemplate(createDeterministicIdFactory());
    const issues = validateDocument(doc);
    const errors = issues.filter((i) => i.level === "error");
    expect(errors).toHaveLength(0);
  });

  test("document title is 'Portfolio'", () => {
    const doc = createPortfolioTemplate(createDeterministicIdFactory());
    expect(doc.meta.title).toBe("Portfolio");
  });

  test("contains image nodes", () => {
    const doc = createPortfolioTemplate(createDeterministicIdFactory());
    const images = Object.values(doc.nodes).filter((n) => n.type === "image");
    expect(images.length).toBeGreaterThanOrEqual(3);
  });
});

describe("createBlogPostTemplate", () => {
  test("produces a valid document with no errors", () => {
    const doc = createBlogPostTemplate(createDeterministicIdFactory());
    const issues = validateDocument(doc);
    const errors = issues.filter((i) => i.level === "error");
    expect(errors).toHaveLength(0);
  });

  test("document title is 'Blog Post'", () => {
    const doc = createBlogPostTemplate(createDeterministicIdFactory());
    expect(doc.meta.title).toBe("Blog Post");
  });

  test("contains an h1 heading", () => {
    const doc = createBlogPostTemplate(createDeterministicIdFactory());
    const h1Nodes = Object.values(doc.nodes).filter(
      (n) => n.type === "text" && (n.props as { as?: string }).as === "h1",
    );
    expect(h1Nodes.length).toBeGreaterThanOrEqual(1);
  });

  test("contains an h3 subtitle", () => {
    const doc = createBlogPostTemplate(createDeterministicIdFactory());
    const h3Nodes = Object.values(doc.nodes).filter(
      (n) => n.type === "text" && (n.props as { as?: string }).as === "h3",
    );
    expect(h3Nodes.length).toBeGreaterThanOrEqual(1);
  });

  test("has an author section with image", () => {
    const doc = createBlogPostTemplate(createDeterministicIdFactory());
    const images = Object.values(doc.nodes).filter((n) => n.type === "image");
    expect(images.length).toBeGreaterThanOrEqual(1);
  });
});

describe("createPricingTemplate", () => {
  test("produces a valid document with no errors", () => {
    const doc = createPricingTemplate(createDeterministicIdFactory());
    const issues = validateDocument(doc);
    const errors = issues.filter((i) => i.level === "error");
    expect(errors).toHaveLength(0);
  });

  test("document title is 'Pricing Page'", () => {
    const doc = createPricingTemplate(createDeterministicIdFactory());
    expect(doc.meta.title).toBe("Pricing Page");
  });

  test("has a 3-column pricing section", () => {
    const doc = createPricingTemplate(createDeterministicIdFactory());
    const colsNodes = Object.values(doc.nodes).filter(
      (n) => n.type === "columns" && (n.props as { columns?: number }).columns === 3,
    );
    expect(colsNodes.length).toBeGreaterThanOrEqual(1);
  });

  test("has 3 pricing CTA buttons", () => {
    const doc = createPricingTemplate(createDeterministicIdFactory());
    const buttons = Object.values(doc.nodes).filter((n) => n.type === "button");
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });
});

describe("createComingSoonTemplate", () => {
  test("produces a valid document with no errors", () => {
    const doc = createComingSoonTemplate(createDeterministicIdFactory());
    const issues = validateDocument(doc);
    const errors = issues.filter((i) => i.level === "error");
    expect(errors).toHaveLength(0);
  });

  test("document title is 'Coming Soon'", () => {
    const doc = createComingSoonTemplate(createDeterministicIdFactory());
    expect(doc.meta.title).toBe("Coming Soon");
  });

  test("has a 'Coming Soon' heading", () => {
    const doc = createComingSoonTemplate(createDeterministicIdFactory());
    const headingNodes = Object.values(doc.nodes).filter(
      (n) =>
        n.type === "text" &&
        (n.props as { content?: Array<{ text: string }> }).content?.some((seg) => seg.text.includes("Coming Soon")),
    );
    expect(headingNodes.length).toBeGreaterThanOrEqual(1);
  });

  test("has spacer nodes", () => {
    const doc = createComingSoonTemplate(createDeterministicIdFactory());
    const spacers = Object.values(doc.nodes).filter((n) => n.type === "spacer");
    expect(spacers.length).toBeGreaterThanOrEqual(1);
  });
});

describe("all templates — each create() call uses the provided idFactory", () => {
  test("IDs are deterministic when using deterministic factory", () => {
    for (const tmpl of TEMPLATES) {
      const factory1 = createDeterministicIdFactory();
      const factory2 = createDeterministicIdFactory();
      const doc1 = tmpl.create(factory1);
      const doc2 = tmpl.create(factory2);
      expect(Object.keys(doc1.nodes).sort()).toEqual(Object.keys(doc2.nodes).sort());
    }
  });

  test("every template document passes validation with zero errors", () => {
    for (const tmpl of TEMPLATES) {
      const doc = tmpl.create(createDeterministicIdFactory());
      const issues = validateDocument(doc);
      const errors = issues.filter((i) => i.level === "error");
      expect(errors, `Template "${tmpl.id}" has validation errors`).toHaveLength(0);
    }
  });

  test("every template document has a valid rootId pointing to a page node", () => {
    for (const tmpl of TEMPLATES) {
      const doc = tmpl.create(createDeterministicIdFactory());
      const root = doc.nodes[doc.rootId];
      expect(root, `Template "${tmpl.id}" root node missing`).toBeDefined();
      expect(root?.type).toBe("page");
    }
  });

  test("every node's children are present in the nodes record", () => {
    for (const tmpl of TEMPLATES) {
      const doc = tmpl.create(createDeterministicIdFactory());
      for (const [nodeId, node] of Object.entries(doc.nodes)) {
        for (const childId of node.children) {
          expect(
            doc.nodes[childId],
            `Template "${tmpl.id}": node "${nodeId}" references missing child "${childId}"`,
          ).toBeDefined();
        }
      }
    }
  });
});
