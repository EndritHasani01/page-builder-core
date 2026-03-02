# Page Builder

A browser-based visual page builder with live preview, multi-document workspace backed by LocalStorage, and export to JSON or standalone HTML.

---

## Features

- **Drag-and-drop canvas** — drag blocks from the palette onto the canvas or reorder existing nodes
- **Live preview** — every edit reflects instantly; no refresh needed
- **Preview mode** — toggle between edit and clean preview; simulate Desktop / Tablet / Mobile / Base breakpoints
- **Inline text editing** — double-click any text node on the canvas to edit it in place
- **Inspector** — Content and Style tabs for the selected node; responsive style overrides per breakpoint
- **Undo / Redo** — full history with coalescing (rapid typing collapses into one step)
- **Copy / Cut / Paste** — internal clipboard with automatic ID remapping
- **Multi-document workspace** — create, rename, duplicate, and delete pages; the active document is remembered on reload
- **Autosave** — debounced write to LocalStorage after every change; backup rotation keeps the previous version
- **Export to JSON** — full document model, re-importable
- **Export to HTML** — standalone `<!doctype html>` file rendered via `react-dom/server`, XSS-safe
- **Validation** — per-node errors and warnings surfaced in the toolbar and inspector
- **Keyboard shortcuts** — common editing actions bound to standard keys (see Shortcuts dialog in the toolbar)
- **Responsive layout** — on narrow screens the Palette and Inspector collapse into slide-in drawers

### Block types

| Block | Description |
|---|---|
| `page` | Root node; sets document title and language |
| `section` | Full-width page section; `default` or `hero` variant |
| `columns` | Flex row layout; 2–6 columns |
| `column` | A single column inside a Columns block |
| `container` | Generic wrapper; renders as `div`, `main`, `header`, or `footer` |
| `text` | Inline or block text; renders as `p`, `h1`, `h2`, `h3`, or `span` |
| `image` | Responsive image with optional link |
| `button` | Primary or secondary call-to-action button with optional `href` |
| `spacer` | Vertical whitespace block |
| `divider` | Horizontal rule with configurable thickness and color |

---

## Tech stack

| | |
|---|---|
| React 19 | UI and server-side rendering for HTML export |
| TypeScript | Strict types throughout |
| Vite | Dev server and production build |
| Zustand | Global editor state |
| Immer | Immutable updates with structural patches (powers undo/redo) |
| @dnd-kit | Accessible drag-and-drop |
| Zod | Schema validation for JSON import and LocalStorage parsing |
| nanoid | Unique node IDs |
| Vitest | Unit tests |
| Playwright | End-to-end browser tests |

---

## Getting started

### Prerequisites

- Node.js 20+ and npm

### Install

```bash
npm install
```

### Development server

```bash
npm run dev
```

Opens at `http://localhost:5173`.

### Production build

```bash
npm run build
```

Output goes to `dist/`.

### Preview production build

```bash
npm run preview
```

---

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check then build for production |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Run `tsc --noEmit` |
| `npm run test` | Run unit tests in watch mode (Vitest) |
| `npm run test:run` | Run unit tests once |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

---

## Project structure

```
src/
├── editor-core/      Pure domain logic — types, commands, block registry,
│                     validation, node factory, style helpers, migrations
├── store/            Zustand editor store — wires editor-core to UI state,
│                     undo/redo stack, clipboard, transactions
├── renderer/         RenderDocument component — live canvas and HTML export renderer
├── dnd/              Drag-and-drop utilities and drop-intent computation
├── persistence/      LocalStorage read/write, autosave, backup rotation,
│                     multi-document workspace, schema parsing
├── export/           JSON export, HTML export, XSS sanitization
└── ui/
    └── PageBuilder/
        ├── components/   Toolbar, Canvas, Inspector, Palette, Dialogs, Overlays, Toasts
        └── hooks/        DnD, keyboard shortcuts, persistence, palette insertion, toasts
```

---

## LocalStorage schema

| Key | Contents |
|---|---|
| `pb:index:v1` | Workspace index — list of all document IDs with title and timestamps |
| `pb:activeDocId` | ID of the last active document |
| `pb:doc:{id}` | Serialized `Document` JSON for a specific page |
| `pb:doc:{id}:backup` | Previous version of the same document (one-version backup) |

---

## Keyboard shortcuts

Open the **Shortcuts** dialog from the toolbar for the full list. Common shortcuts:

| Key | Action |
|---|---|
| `Delete` / `Backspace` | Delete selected node |
| `Ctrl+D` | Duplicate selected node |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+C` | Copy selected node |
| `Ctrl+X` | Cut selected node |
| `Ctrl+V` | Paste |
| `P` | Toggle preview mode |
| `Escape` | Deselect / close dialog |
| `?` | Open Shortcuts dialog |
