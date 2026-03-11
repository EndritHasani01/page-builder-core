# Page Builder Core - Project Memory

## Architecture Overview
- **App entry**: `src/App.tsx` → renders `<PageBuilder />`
- **Main editor**: `src/ui/PageBuilder/PageBuilder.tsx` - manages view state (dashboard/editor), all editor state
- **Dashboard**: `src/ui/PageBuilder/components/WorkspaceDashboard.tsx` - standalone full-screen view
- **Toolbar**: `src/ui/PageBuilder/components/PageBuilderToolbar.tsx`
- **Persistence**: `src/persistence/workspace.ts` + hook at `src/ui/PageBuilder/hooks/usePageBuilderPersistence.ts`
- **Renderer**: `src/renderer/RenderDocument.tsx` - takes `doc`, `mode`, `breakpoint` props; modes: "editor"|"preview"|"export"
- **Store**: `src/store/editorStore.ts` - singleton zustand store

## View State Pattern
`PageBuilder.tsx` has `AppView = 'dashboard' | 'editor'` state:
- `initialView()` checks `pb:activeDocId` and `pb:index:v1` in localStorage
- Dashboard shows when no active doc or doc doesn't exist in workspace
- Editor shows otherwise
- Home button in toolbar → `goToDashboard()` (flushes autosave first)
- Opening a doc from dashboard → `persistence.activateDocId(docId)` + `setView('editor')`

## Persistence Keys (localStorage)
- `pb:activeDocId` - currently active document ID
- `pb:index:v1` - workspace index (JSON with `version:1, docs:[{id,title,createdAt,updatedAt}]`)
- `pb:doc:{docId}` - document data
- `pb:doc:{docId}:backup` - backup snapshot
- `pb:ui:panelWidths` - saved panel widths

## CSS Patterns
- CSS Modules with `composes:` for shared base styles
- Editor UI variables: `--editor-border`, `--editor-surface`, `--editor-surface-raised`, `--editor-text`, `--editor-text-muted`, `--editor-accent`, `--editor-accent-hover`, `--editor-accent-muted`, `--editor-error`, `--editor-error-bg`, `--editor-warning`, `--editor-duration-fast`
- Document theme variables: `--color-primary`, `--color-bg`, `--color-text`, `--font-body`
- Responsive breakpoint: `@media (max-width: 1024px)` for narrow/mobile

## Test Patterns
- Test files use vitest + React Testing Library
- `beforeEach`: `localStorage.clear()` + seed workspace + `resetSingletonStore()` + `editorStore.setState()`
- Workspace seed for editor view tests:
  ```ts
  localStorage.setItem("pb:activeDocId", "default");
  localStorage.setItem("pb:index:v1", '{"version":1,"docs":[{"id":"default","title":"Test","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}]}');
  ```
- For dashboard view tests: leave `pb:activeDocId` unset (or removeItem)
- `testTimeout: 15000` in vitest.config.ts (needed for full-suite parallelism)

## Key Gotchas
- `IntersectionObserver` not available in jsdom — guard with `typeof IntersectionObserver === "undefined"` check
- WorkspaceDashboard renders `RenderDocument` thumbnails in export mode inside `DndContext` wrappers (per thumbnail) to avoid missing context errors
- `editorStore` is a singleton — always reset in `beforeEach` with `editorStore.setState()`
- Tests that render `<PageBuilder />` and start in dashboard view should NOT wait for `"Save now"` button (editor-only element)
