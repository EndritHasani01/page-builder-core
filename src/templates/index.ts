import type { IdFactory, Document } from "@/editor-core";
import { createBlankTemplate } from "./blank";
import { createLandingPageTemplate } from "./landing-page";
import { createPortfolioTemplate } from "./portfolio";
import { createBlogPostTemplate } from "./blog-post";
import { createPricingTemplate } from "./pricing";
import { createComingSoonTemplate } from "./coming-soon";

export type TemplateDefinition = {
  id: string;
  name: string;
  description: string;
  create: (idFactory: IdFactory) => Document;
};

export const TEMPLATES: TemplateDefinition[] = [
  {
    id: "blank",
    name: "Blank Page",
    description: "Start with a clean slate. A simple two-column layout ready for your content.",
    create: createBlankTemplate,
  },
  {
    id: "landing-page",
    name: "Landing Page",
    description: "Hero section, three-column features, testimonial, and a call-to-action — ready to launch.",
    create: createLandingPageTemplate,
  },
  {
    id: "portfolio",
    name: "Portfolio",
    description: "Showcase your work with a full-width hero, image-text project pairs, and an about section.",
    create: createPortfolioTemplate,
  },
  {
    id: "blog-post",
    name: "Blog Post",
    description: "Long-form article layout with title, subtitle, body content, and author bio.",
    create: createBlogPostTemplate,
  },
  {
    id: "pricing",
    name: "Pricing Page",
    description: "Heading section and three pricing cards with features and call-to-action buttons.",
    create: createPricingTemplate,
  },
  {
    id: "coming-soon",
    name: "Coming Soon",
    description: "A centered hero with a bold heading, subtext, and a notify-me button.",
    create: createComingSoonTemplate,
  },
];

export {
  createBlankTemplate,
  createLandingPageTemplate,
  createPortfolioTemplate,
  createBlogPostTemplate,
  createPricingTemplate,
  createComingSoonTemplate,
};
