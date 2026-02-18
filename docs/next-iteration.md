# Next Iteration Feature Proposals

This document proposes incremental, implementation-aware improvements for the next iteration of the Page Builder. Proposals align with the current architecture (core `Document` model + command pipeline + offline-first LocalStorage persistence) and avoid backend dependencies or breaking the canonical JSON model.

## Guardrails (do not break)

- Offline at runtime: no backend, no required network services.
- Canonical persisted format remains the schema-versioned `Document` JSON model (`src/editor-core/types.ts`, `src/editor-core/schema.ts`).
- All document mutations continue to flow through a command pipeline (extend `DocCommand` rather than editing `doc.nodes` ad-hoc).
- Security constraints stay non-negotiable:
  - No `dangerouslySetInnerHTML`.
  - Sanitize URL-like props for preview/export (shared sanitizer).
  - Apply only allowlisted style keys (`STYLE_KEYS`).

## Proposals

### 1) Multi-document workspace (LocalStorage)

**Problem**
- The UI uses a hard-coded `docId = "default"` (`src/ui/PageBuilder/PageBuilder.tsx`), so users cannot manage multiple pages, templates, or drafts.
- Reset/recovery flows are tied to a single saved snapshot/backup, limiting flexibility.

**Proposed Solution**
- Add a lightweight local "workspace" (still LocalStorage-backed):
  - Document index: `pb:index` containing `{ docs: Array<{ id, title, updatedAt }> }`.
  - Document keys remain `pb:doc:<id>` and `pb:doc:<id>:backup` (`src/persistence/localStorage.ts`).
- Add a simple UI for:
  - Create new document (from default template).
  - Rename (updates `doc.meta.title` and index metadata).
  - Duplicate (copy JSON, remap ids via `remapIds` using store `idFactory`).
  - Delete (clears primary + backup keys and removes from index).
- Keep the `Document` schema unchanged; this is a persistence + UI feature.

**Impact**
- Enables real workflows (multiple pages, templates, experiments) without changing export/import format.
- Adds modest complexity to persistence and UI, but remains fully offline and backwards-compatible with existing saved docs (they become one entry in the index).

---

### 2) Break up `PageBuilder.tsx` into composable components (maintainability)

**Problem**
- `src/ui/PageBuilder/PageBuilder.tsx` is a large monolith (toolbar, dialogs, inspector, palette, DnD, persistence, toasts, focus management).
- Feature work and testing become harder as more logic accumulates in one file.

**Proposed Solution**
- Split into focused components and hooks without changing behavior:
  - `Toolbar`, `Palette`, `Canvas`, `Inspector`, `Dialogs`, `ToastHost`.
  - `useAutosave(docId)`, `useKeyboardShortcuts()`, `useDndController()`.
- Keep the editor store as the single source of UI state (avoid adding local state where store state is appropriate).

**Impact**
- Improves readability, testability, and onboarding speed.
- Reduces merge conflicts and makes future UI iterations cheaper.

---

### 3) Renderer performance: node-level subscriptions in editor mode

**Problem**
- `RenderDocument` currently receives the whole `doc` object and recursively renders the tree.
- Any document change creates a new `doc` object, which tends to re-render large parts of the tree (risk grows with node count).

**Proposed Solution**
- Introduce an editor-only renderer wrapper that reads node data by `nodeId` from the store, minimizing re-render cascades:
  - Add `RenderDocumentFromStore` in `src/renderer/` (or `src/ui/`) that uses `useEditorStore` selectors per node id.
  - Keep the existing `RenderDocument` as the pure, framework-agnostic renderer for preview/export and for unit tests.
- Optionally add a small `RendererContext` providing `{ getNode(id), rootId, theme }` so pure renderers can avoid prop-drilling `doc`.

**Impact**
- Improves responsiveness for large documents and frequent edits (typing, DnD).
- Preserves the current export path (export uses pure `RenderDocument` and stays deterministic).

---

### 4) Constraints UI: toggle `hidden`/`locked` and surface blockability

**Problem**
- The model supports `constraints.hidden` and `constraints.locked`, but the UI only shows badges; editing constraints is not supported.
- Users cannot intentionally hide sections for export, lock layouts, or prevent accidental edits.

**Proposed Solution**
- Add a "Constraints" group in the Inspector (applies to all nodes):
  - Toggle Hidden: affects preview/export rendering and HTML warnings.
  - Toggle Locked: disables inspector editing and blocks commands (already enforced in `src/editor-core/commands.ts` and `src/dnd/canDrop.ts`).
- Implement via a new command (keeps the pipeline consistent):
  - `UPDATE_CONSTRAINTS { nodeId, patch: Partial<NodeConstraints> }` in `src/editor-core/commands.ts`.
  - Store/history integration via `dispatch`.

**Impact**
- Unlocks practical content workflows (draft/variants, guarded structure).
- Minimal changes to core model; primarily new command + inspector UI wiring.

---

### 5) Improve the Inspector field system (typed inputs, fewer stringly-typed props)

**Problem**
- Some inspector fields are effectively "stringly typed" (example: `columns.props.columns` uses a text field even though it is numeric).
- This forces special-case parsing logic and can lead to inconsistent validation UX.

**Proposed Solution**
- Extend `InspectorField` to support additional kinds where needed (e.g., `number` with min/max/step).
  - Update TypeScript types (`src/editor-core/types.ts`) and runtime schema if applicable.
  - Update inspector UI rendering in `PageBuilder` to render numeric inputs and validate at input-time.
- For Columns specifically:
  - Replace freeform input with a stepper/select constrained to 2-6.
  - Keep `SET_COLUMNS` behavior as the authoritative way to reconcile `columns.children`.

**Impact**
- Reduces edge cases and improves UX (fewer confusing validation errors).
- Keeps the JSON model unchanged and leverages existing command safeguards.

---

### 6) Theme and meta editing as first-class commands

**Problem**
- `doc.theme` and `doc.meta.title` exist, but editing is not clearly first-class (theme tokens exist; UI is largely node-focused).
- Without a command path, theme/meta updates risk becoming ad-hoc mutations.

**Proposed Solution**
- Add document-level commands:
  - `UPDATE_THEME { patch }`
  - `UPDATE_META { patch }` (restricted to safe fields like `title`, `updatedAt`)
- Add a "Document" section in the Inspector when the Page root is selected:
  - Title, language (`page.props.lang` already exists), theme colors/typography/spacing unit.
  - Reuse existing token system (`themeToCssVars`) and keep values in `doc.theme`.

**Impact**
- Makes theme and document metadata editable with undo/redo and consistent validation.
- Improves export quality and consistency (theme variables already drive preview/export styling).

---

### 7) Inline text editing on the canvas (opt-in)

**Problem**
- Editing text requires selecting a node and using the Inspector, which is slow for content-heavy pages.

**Proposed Solution**
- Add an inline editing mode for `text` nodes in editor mode:
  - Enter edit mode on double-click (or Enter) and render the text element as `contentEditable`.
  - Commit on blur/Enter; cancel on Escape.
  - Dispatch `UPDATE_PROPS` with a coalesce key to keep undo history clean (reuse existing coalescing in `src/store/editorStore.ts`).
- Keep content as plain strings (no HTML). On input, read `textContent` only.

**Impact**
- Faster content editing and reduced context switching.
- Requires careful focus/DnD interaction handling, but does not change the document model or safety posture.

---

### 8) Export packaging options (still sanitized, still offline)

**Problem**
- HTML export is functional but minimal: users may want a more "drop-in" output that includes basic CSS reset and optional theme CSS vars without relying solely on inline styles.

**Proposed Solution**
- Add export options (no backend):
  - `mode: "full" | "snippet"` already exists; extend with `includeStyleTag?: boolean` for full exports.
  - Generate a small `<style>` tag for:
    - `:root` theme variables (from `doc.theme`).
    - A minimal reset for consistent typography/background.
  - Keep URL sanitization as-is (`src/export/sanitize.ts`) and avoid arbitrary style injection by continuing to rely on allowlisted style props.
- (Optional) Add a second export artifact:
  - `page.css` containing the same CSS (downloaded alongside HTML).

**Impact**
- Better out-of-the-box publishing experience while preserving security constraints.
- No changes to the canonical JSON model; export-only enhancement.

---

### 9) Schema evolution discipline: add migrations as the schema grows

**Problem**
- `src/editor-core/migrate.ts` has an empty migration list; any version drift will lead to "unsupported version" failures.
- Strict Zod schemas (`.strict()`) mean even additive fields require coordinated versioning.

**Proposed Solution**
- Establish a migration workflow:
  - Add at least one real migration (e.g., `1.0.0 -> 1.0.1`) as a template, even if it is a no-op normalization pass.
  - Add a dedicated migration test suite that feeds raw JSON and asserts post-migration normalized structure.
  - Ensure persistence surfaces `migratedFrom` consistently (already wired in `PageBuilder`).

**Impact**
- Prevents data loss and improves confidence in future enhancements that require schema changes.
- Keeps the JSON model canonical and versioned; avoids "flag days" where old docs become unreadable.

## Suggested sequencing

- Iteration A (DX + foundations): #2 (split PageBuilder), #9 (migration discipline), #5 (typed inspector fields).
- Iteration B (user value): #1 (multi-doc workspace), #4 (constraints UI), #6 (theme/meta commands).
- Iteration C (polish + scale): #3 (renderer perf), #7 (inline text), #8 (export packaging).

