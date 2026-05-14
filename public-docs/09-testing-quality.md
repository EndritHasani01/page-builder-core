# Testing And Quality

The test strategy follows the architecture. Core document logic has focused unit tests, React and store behavior have integration tests, and critical user journeys are covered with Playwright.

## Quality Commands

```bash
npm run typecheck
npm run lint
npm run test:run
npm run test:e2e
npm run build
```

Recommended local order:

```bash
npm run typecheck
npm run lint
npm run test:run
npm run build
```

Run E2E tests when UI behavior, persistence, DnD, templates, import, export, or keyboard workflows change.

## Test Layers

| Layer              | Purpose                                                       | Example files                   |
| ------------------ | ------------------------------------------------------------- | ------------------------------- |
| Core unit tests    | Prove document rules without React                            | `src/editor-core/*.test.ts`     |
| DnD unit tests     | Prove drop rule and intent calculation                        | `src/dnd/*.test.ts`             |
| Store tests        | Prove history, selection, clipboard, and commands             | `src/store/editorStore.test.ts` |
| Renderer tests     | Prove document rendering behavior                             | `src/renderer/*.test.tsx`       |
| Persistence tests  | Prove LocalStorage, autosave, parsing, and workspace behavior | `src/persistence/*.test.ts`     |
| Export tests       | Prove JSON/HTML output and sanitization                       | `src/export/export.test.ts`     |
| UI component tests | Prove panels, dialogs, and editor components                  | `src/ui/**/*.test.tsx`          |
| E2E tests          | Prove browser-level workflows                                 | `e2e/*.spec.ts`                 |

## Core Logic Coverage

Core tests should cover:

- Valid and invalid document structures.
- Allowed child relationships.
- Command behavior.
- Node duplication and subtree remapping.
- Style resolution and breakpoint inheritance.
- URL and validation helpers.
- Registry constraints.
- Migration and normalization behavior.

Why this matters: if core rules are correct, UI features can call into them confidently.

## Store Coverage

The store is responsible for making commands feel like editor actions. Store tests should cover:

- Undo/redo stack behavior.
- Patch creation and application.
- Transaction commit and discard.
- Coalesced history entries.
- Selection fallback after delete.
- Multi-select behavior.
- Copy, cut, paste, and duplicate.
- Document replacement after import or load.

## Renderer Coverage

Renderer tests should verify:

- Supported block rendering.
- Different renderer modes.
- Form and media block behavior.
- Responsive style application.
- Export mode differences from editor mode.

The renderer is the bridge between structured document data and visible output, so tests should focus on behavior rather than implementation details.

## Persistence And Export Coverage

Persistence tests protect user work. They should cover:

- Saving and loading documents.
- Backup recovery.
- Quota-aware failure results.
- Workspace index behavior.
- Active document behavior.
- Import parse errors.
- Size and node-count limits.
- Migration results.

Export tests protect handoff safety. They should cover:

- JSON export shape.
- Full HTML export.
- Snippet export.
- Escaping metadata.
- Stripping unsafe URLs.
- Warning users about changed export output.

## E2E Coverage

The browser test suite should stay focused on critical user journeys:

- Create a page.
- Edit content.
- Drag and drop blocks.
- Save and reload.
- Use templates.
- Use keyboard shortcuts.
- Use media and form blocks.
- Export safely.

Avoid turning E2E tests into exhaustive unit tests. Browser tests are slower and more brittle, so they should protect user journeys that cannot be fully trusted through unit tests alone.

## Screenshot-Backed Behaviors

The current app screenshots correspond to testable product flows:

- Workspace start: `e2e/workspace.spec.ts`
- Template creation: `e2e/templates.spec.ts`
- Drag feedback: `e2e/dnd-feedback.spec.ts`
- DnD insertion: `e2e/dnd.spec.ts`
- Keyboard shortcuts: `e2e/keyboard.spec.ts`
- Persistence: `e2e/persistence.spec.ts`
- Export: `e2e/export.spec.ts`

## Adding A Regression Test

When fixing a bug:

1. Identify the lowest layer that owns the behavior.
2. Add a focused test at that layer.
3. Add a UI or E2E test only when the bug depends on browser interaction.
4. Keep test data small and explicit.
5. Prefer asserting user-visible behavior over implementation details in React tests.

## Test Gaps To Watch

Good future coverage areas:

- More migration edge cases as schema versions grow.
- Larger document performance scenarios.
- Accessibility checks for keyboard and screen reader workflows.
- More mobile breakpoint editor flows.
- Export output snapshots for representative templates.
