import { z } from "zod";

import { BREAKPOINTS, LATEST_SCHEMA_VERSION, NODE_TYPES } from "./constants";
import { isProbablySafeUrl } from "./validationUtils";

const SafeUrlSchema = z.string().refine((v) => !v || isProbablySafeUrl(v), {
  message: "URL is not safe or uses a disallowed protocol.",
});

const NodeIdSchema = z.string().min(1);

const NodeConstraintsSchema = z
  .object({
    locked: z.boolean().optional(),
    hidden: z.boolean().optional(),
    draggable: z.boolean().optional(),
    deletable: z.boolean().optional(),
    droppable: z.boolean().optional(),
  })
  .strict();

const StylePropsSchema = z
  .object({
    display: z.enum(["block", "flex"]).optional(),
    flexDirection: z.enum(["row", "column"]).optional(),
    justifyContent: z.enum(["flex-start", "center", "flex-end", "space-between"]).optional(),
    alignItems: z.enum(["stretch", "flex-start", "center", "flex-end"]).optional(),
    gap: z.string().optional(),

    padding: z.string().optional(),
    margin: z.string().optional(),
    width: z.string().optional(),
    maxWidth: z.string().optional(),
    minHeight: z.string().optional(),

    fontFamily: z.string().optional(),
    fontSize: z.string().optional(),
    fontWeight: z.union([z.number(), z.string()]).optional(),
    lineHeight: z.string().optional(),
    textAlign: z.enum(["left", "center", "right"]).optional(),
    color: z.string().optional(),

    backgroundColor: z.string().optional(),
    borderRadius: z.string().optional(),
    border: z.string().optional(),
    boxShadow: z.string().optional(),
    opacity: z.number().optional(),
  })
  .strict();

const ResponsiveStyleSchema = z
  .object({
    base: StylePropsSchema,
    sm: StylePropsSchema.partial().optional(),
    md: StylePropsSchema.partial().optional(),
    lg: StylePropsSchema.partial().optional(),
  })
  .strict();

const NodeBaseSchema = z
  .object({
    id: NodeIdSchema,
    parentId: NodeIdSchema.nullable(),
    children: z.array(NodeIdSchema),
    constraints: NodeConstraintsSchema.optional(),
    style: ResponsiveStyleSchema.optional(),
  })
  .strict();

const PagePropsSchema = z
  .object({
    title: z.string(),
    lang: z.string(),
  })
  .strict();

const SectionPropsSchema = z
  .object({
    variant: z.enum(["default", "hero"]),
    fullWidth: z.boolean(),
  })
  .strict();

const ColumnsPropsSchema = z
  .object({
    columns: z.number(),
    gap: z.string(),
  })
  .strict();

const ColumnPropsSchema = z
  .object({
    width: z.string().optional(),
  })
  .strict();

const ContainerPropsSchema = z
  .object({
    as: z.enum(["div", "main", "header", "footer"]),
  })
  .strict();

const InlineLinkSchema = z
  .object({
    href: z.string(),
  })
  .strict();

const InlineSegmentSchema = z
  .object({
    text: z.string(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    strikethrough: z.boolean().optional(),
    code: z.boolean().optional(),
    link: InlineLinkSchema.optional(),
  })
  .strict();

const RichContentSchema = z.array(InlineSegmentSchema).min(1);

const TextPropsSchema = z
  .object({
    content: RichContentSchema,
    as: z.enum(["p", "h1", "h2", "h3", "span"]),
    listType: z.enum(["ul", "ol"]).optional(),
  })
  .strict();

const ImagePropsSchema = z
  .object({
    src: z.string(),
    alt: z.string(),
    fit: z.enum(["cover", "contain", "fill"]),
    linkTo: z.string().optional(),
    borderRadius: z.enum(["none", "sm", "md", "lg", "full"]).optional(),
    aspectRatio: z.enum(["auto", "16:9", "4:3", "1:1"]).optional(),
  })
  .strict();

const VideoPropsSchema = z
  .object({
    url: z.string(),
    aspectRatio: z.enum(["16:9", "4:3", "1:1"]),
    autoplay: z.boolean(),
    loop: z.boolean(),
  })
  .strict();

const EmbedPropsSchema = z
  .object({
    url: z.string(),
    width: z.string(),
    height: z.string(),
  })
  .strict();

const IconPropsSchema = z
  .object({
    icon: z.string(),
    size: z.number().int().min(12).max(128),
    color: z.string(),
  })
  .strict();

const ButtonPropsSchema = z
  .object({
    label: z.string(),
    href: z.string(),
    variant: z.enum(["primary", "secondary"]),
  })
  .strict();

const SpacerPropsSchema = z
  .object({
    height: z.string(),
  })
  .strict();

const DividerPropsSchema = z
  .object({
    thickness: z.string(),
    color: z.string(),
  })
  .strict();

const SelectOptionSchema = z
  .object({
    label: z.string().min(1),
    value: z.string().min(1),
  })
  .strict();

const FormPropsSchema = z
  .object({
    action: z.string(),
    method: z.enum(["get", "post"]),
    name: z.string().optional(),
  })
  .strict();

const TextInputPropsSchema = z
  .object({
    label: z.string(),
    name: z.string(),
    placeholder: z.string(),
    inputType: z.enum(["text", "email", "tel", "number", "password"]),
    required: z.boolean(),
  })
  .strict();

const TextareaPropsSchema = z
  .object({
    label: z.string(),
    name: z.string(),
    placeholder: z.string(),
    rows: z.number().int().min(2).max(20),
    required: z.boolean(),
  })
  .strict();

const SelectInputPropsSchema = z
  .object({
    label: z.string(),
    name: z.string(),
    options: z.array(SelectOptionSchema).min(1),
    required: z.boolean(),
  })
  .strict();

const CheckboxPropsSchema = z
  .object({
    label: z.string(),
    name: z.string(),
    checked: z.boolean(),
  })
  .strict();

const RadioGroupPropsSchema = z
  .object({
    label: z.string(),
    name: z.string(),
    options: z.array(SelectOptionSchema).min(1),
    required: z.boolean(),
  })
  .strict();

const SubmitButtonPropsSchema = z
  .object({
    label: z.string(),
    variant: z.enum(["primary", "secondary"]),
  })
  .strict();

export const NodeSchema = z.discriminatedUnion("type", [
  NodeBaseSchema.extend({ type: z.literal("page"), props: PagePropsSchema }),
  NodeBaseSchema.extend({ type: z.literal("section"), props: SectionPropsSchema }),
  NodeBaseSchema.extend({ type: z.literal("columns"), props: ColumnsPropsSchema }),
  NodeBaseSchema.extend({ type: z.literal("column"), props: ColumnPropsSchema }),
  NodeBaseSchema.extend({ type: z.literal("container"), props: ContainerPropsSchema }),
  NodeBaseSchema.extend({ type: z.literal("text"), props: TextPropsSchema }),
  NodeBaseSchema.extend({ type: z.literal("image"), props: ImagePropsSchema }),
  NodeBaseSchema.extend({ type: z.literal("button"), props: ButtonPropsSchema }),
  NodeBaseSchema.extend({ type: z.literal("spacer"), props: SpacerPropsSchema }),
  NodeBaseSchema.extend({ type: z.literal("divider"), props: DividerPropsSchema }),
  NodeBaseSchema.extend({ type: z.literal("video"), props: VideoPropsSchema }),
  NodeBaseSchema.extend({ type: z.literal("embed"), props: EmbedPropsSchema }),
  NodeBaseSchema.extend({ type: z.literal("icon"), props: IconPropsSchema }),
  NodeBaseSchema.extend({ type: z.literal("form"), props: FormPropsSchema }),
  NodeBaseSchema.extend({ type: z.literal("textInput"), props: TextInputPropsSchema }),
  NodeBaseSchema.extend({ type: z.literal("textarea"), props: TextareaPropsSchema }),
  NodeBaseSchema.extend({ type: z.literal("selectInput"), props: SelectInputPropsSchema }),
  NodeBaseSchema.extend({ type: z.literal("checkbox"), props: CheckboxPropsSchema }),
  NodeBaseSchema.extend({ type: z.literal("radioGroup"), props: RadioGroupPropsSchema }),
  NodeBaseSchema.extend({ type: z.literal("submitButton"), props: SubmitButtonPropsSchema }),
]);

export const ThemeSchema = z
  .object({
    colors: z
      .object({
        background: z.string(),
        text: z.string(),
        primary: z.string(),
        border: z.string(),
      })
      .strict(),
    typography: z
      .object({
        fontFamily: z.string(),
        baseFontSize: z.string(),
        scale: z.number(),
      })
      .strict(),
    spacing: z.object({ unit: z.string() }).strict(),
    breakpoints: z
      .object({
        sm: z.number(),
        md: z.number(),
        lg: z.number(),
      })
      .strict(),
  })
  .strict();

export const DocumentMetaSchema = z
  .object({
    schemaVersion: z.literal(LATEST_SCHEMA_VERSION),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    title: z.string(),
    slug: z.string().optional(),
    description: z.string().optional(),
    ogTitle: z.string().optional(),
    ogDescription: z.string().optional(),
    ogImage: SafeUrlSchema.optional(),
    favicon: SafeUrlSchema.optional(),
    canonicalUrl: SafeUrlSchema.optional(),
    headSnippet: z.string().optional(),
  })
  .strict();

export const DocumentSchema = z
  .object({
    meta: DocumentMetaSchema,
    theme: ThemeSchema,
    rootId: NodeIdSchema,
    nodes: z.record(NodeIdSchema, NodeSchema),
  })
  .strict();

export function safeParseDocument(raw: unknown) {
  return DocumentSchema.safeParse(raw);
}

export const SupportedNodeTypeSchema = z.enum(NODE_TYPES);
export const SupportedBreakpointSchema = z.enum(BREAKPOINTS);

