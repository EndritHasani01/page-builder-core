# Contributor Guide

This guide explains how to make changes safely in the repository.

## Development Loop

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Before publishing a change:

```bash
npm run typecheck
npm run lint
npm run test:run
npm run build
```

Run E2E tests for workflow changes:

```bash
npm run test:e2e
```

## Code Organization

| Folder             | Responsibility                                                                |
| ------------------ | ----------------------------------------------------------------------------- |
| `src/editor-core/` | Framework-agnostic document model, validation, commands, registry, migrations |
| `src/store/`       | Zustand store, history, selection, clipboard, document dispatch wrappers      |
| `src/renderer/`    | React document renderer for editor, preview, and export modes                 |
| `src/dnd/`         | Drop intent and drop rule helpers                                             |
| `src/persistence/` | LocalStorage, autosave, workspace, import parsing                             |
| `src/export/`      | JSON and HTML export, sanitization, export warnings                           |
| `src/ui/`          | App shell, toolbar, panels, inspector, dialogs, hooks                         |
| `src/templates/`   | Built-in template document factories                                          |
| `e2e/`             | Playwright tests for browser workflows                                        |

## Mutation Rules

Do not edit `doc.nodes` directly inside UI components.

Use commands through the store:

- `ADD_NODE`
- `MOVE_NODE`
- `DELETE_NODE`
- `DUPLICATE_NODE`
- `UPDATE_META`
- `UPDATE_PROPS`
- `UPDATE_STYLE`
- `RESET_STYLE_BREAKPOINT`
- `SET_COLUMNS`
- `INSERT_SUBTREE`
- `UPDATE_THEME`
- `UPDATE_CONSTRAINTS`

This keeps validation, history, selection, and persistence consistent.

## Style Rules

Document styling belongs in the document model through allowlisted `StyleProps`.

Editor chrome styling belongs in UI CSS modules.

Avoid passing arbitrary style objects from imported documents or unvalidated user input into rendered output.

## Import And Export Rules

When adding fields:

- Add TypeScript types.
- Add Zod schemas.
- Add defaults.
- Add validation.
- Add export sanitization if the field can hold a URL or unsafe value.
- Add tests.

Import/export compatibility is part of the public behavior of the app.

## Testing Expectations

Add the lowest-level test that proves the behavior:

- Use editor-core tests for document rules.
- Use store tests for history, selection, and clipboard behavior.
- Use renderer tests for output behavior.
- Use persistence/export tests for data boundaries.
- Use E2E tests for critical browser workflows.

## Documentation Expectations

Update public docs when a change affects:

- Supported block types.
- Document schema.
- Command behavior.
- Persistence or import behavior.
- Export behavior.
- Security boundaries.
- Test commands.
- User-facing workflows shown in screenshots.

## Pull Request Checklist

```md
- [ ] Typecheck passes.
- [ ] Lint passes.
- [ ] Relevant unit/integration tests were added or updated.
- [ ] E2E tests were added or updated for critical workflow changes.
- [ ] Import/export behavior was considered.
- [ ] Security implications were considered for URLs, styles, metadata, embeds, and HTML output.
- [ ] Public documentation was updated if behavior changed.
- [ ] Screenshots were refreshed if the UI changed significantly.
```
