import type { IdFactory, Document, Node } from "@/editor-core";
import { LATEST_SCHEMA_VERSION, createDefaultTheme, createNode } from "@/editor-core";
import { collect } from "./templateUtils";

export function createPricingTemplate(idFactory: IdFactory): Document {
  const now = new Date().toISOString();

  const page = createNode("page", { idFactory, props: { title: "Pricing Page", lang: "en" } });

  // --- Heading section ---
  const headingSection = createNode("section", { idFactory, parentId: page.id, props: { variant: "default", fullWidth: false } });
  const headingCols = createNode("columns", { idFactory, parentId: headingSection.id, props: { columns: 1, gap: "var(--space-4)" } });

  const headingColMain = createNode("column", { idFactory, parentId: headingCols.id });
  const mainHeading = createNode("text", {
    idFactory,
    parentId: headingColMain.id,
    props: { content: [{ text: "Simple, Transparent Pricing" }], as: "h1" },
    style: { base: { color: "var(--color-text)", textAlign: "center", marginBottom: "var(--space-3)" } },
  });
  const mainSubtitle = createNode("text", {
    idFactory,
    parentId: headingColMain.id,
    props: { content: [{ text: "Choose the plan that fits your needs. Upgrade or downgrade at any time." }], as: "p" },
    style: { base: { color: "var(--color-text)", textAlign: "center" } },
  });
  headingColMain.children = [mainHeading.id, mainSubtitle.id];

  headingCols.children = [headingColMain.id];
  headingSection.children = [headingCols.id];

  // --- Pricing cards section ---
  const pricingSection = createNode("section", { idFactory, parentId: page.id, props: { variant: "default", fullWidth: false } });
  const pricingCols = createNode("columns", { idFactory, parentId: pricingSection.id, props: { columns: 3, gap: "var(--space-5)" } });

  type PricingCard = { name: string; price: string; features: string; cta: string; variant: "primary" | "secondary" };

  function makePricingCard(card: PricingCard): Node[] {
    const col = createNode("column", {
      idFactory,
      parentId: pricingCols.id,
      style: { base: { padding: "var(--space-6)", border: "1px solid var(--color-border)", borderRadius: "8px" } },
    });
    const nameNode = createNode("text", {
      idFactory,
      parentId: col.id,
      props: { content: [{ text: card.name, bold: true }], as: "h3" },
      style: { base: { color: "var(--color-primary)", marginBottom: "var(--space-2)" } },
    });
    const priceNode = createNode("text", {
      idFactory,
      parentId: col.id,
      props: { content: [{ text: card.price, bold: true }], as: "p" },
      style: { base: { fontSize: "var(--text-base)", color: "var(--color-text)", marginBottom: "var(--space-3)" } },
    });
    const featuresNode = createNode("text", {
      idFactory,
      parentId: col.id,
      props: { content: [{ text: card.features }], as: "p" },
      style: { base: { color: "var(--color-text)", marginBottom: "var(--space-4)" } },
    });
    const btnNode = createNode("button", {
      idFactory,
      parentId: col.id,
      props: { label: card.cta, href: "#", variant: card.variant },
    });
    col.children = [nameNode.id, priceNode.id, featuresNode.id, btnNode.id];
    return [col, nameNode, priceNode, featuresNode, btnNode];
  }

  const starterNodes = makePricingCard({
    name: "Starter",
    price: "$9 / month",
    features: "Up to 3 projects\n5 GB storage\nBasic analytics\nEmail support",
    cta: "Get Started",
    variant: "secondary",
  });
  const proNodes = makePricingCard({
    name: "Pro",
    price: "$29 / month",
    features: "Unlimited projects\n50 GB storage\nAdvanced analytics\nPriority support\nCustom domains",
    cta: "Start Free Trial",
    variant: "primary",
  });
  const enterpriseNodes = makePricingCard({
    name: "Enterprise",
    price: "Custom pricing",
    features: "Everything in Pro\nUnlimited storage\nDedicated support\nSLA guarantee\nTeam collaboration",
    cta: "Contact Sales",
    variant: "secondary",
  });

  pricingCols.children = [starterNodes[0]!.id, proNodes[0]!.id, enterpriseNodes[0]!.id];
  pricingSection.children = [pricingCols.id];

  page.children = [headingSection.id, pricingSection.id];

  return {
    meta: { schemaVersion: LATEST_SCHEMA_VERSION, createdAt: now, updatedAt: now, title: "Pricing Page" },
    theme: createDefaultTheme(),
    rootId: page.id,
    nodes: collect(
      page,
      headingSection, headingCols, headingColMain, mainHeading, mainSubtitle,
      pricingSection, pricingCols,
      ...starterNodes, ...proNodes, ...enterpriseNodes,
    ),
  };
}
