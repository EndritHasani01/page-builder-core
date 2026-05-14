# Getting Started

This guide is for running and verifying Page Builder Core locally.

The application is client-only at runtime. It does not require a backend service to create, edit, save, preview, import, or export pages. Local documents are saved in browser LocalStorage.

## Prerequisites

- Node.js and npm installed.
- A modern browser.
- Playwright browsers installed if you want to run E2E tests.

## Install

```bash
npm install
```

## Start The Development Server

```bash
npm run dev
```

Vite prints the local URL in the terminal. Open that URL in a browser to use the editor.

## Build

```bash
npm run build
```

The build command runs the TypeScript typecheck first, then produces the Vite production build.

## Typecheck

```bash
npm run typecheck
```

This runs TypeScript in no-emit mode against `tsconfig.json`.

## Unit And Integration Tests

```bash
npm run test:run
```

This runs Vitest once. It covers editor-core logic, state management, rendering behavior, persistence helpers, export safety, and UI components.

## E2E Tests

First-time Playwright setup:

```bash
npx playwright install
```

Run browser tests:

```bash
npm run test:e2e
```

The E2E suite exercises critical browser workflows such as drag and drop, persistence, templates, rich text, keyboard shortcuts, media blocks, and export behavior.

## Lint And Format

```bash
npm run lint
npm run format
```

`npm run format` writes formatting changes. Use it before committing documentation or source changes.

## Recommended Verification Order

Use this order before publishing a change:

```bash
npm run typecheck
npm run lint
npm run test:run
npm run build
```

Run E2E tests as well when the change affects UI flows, drag and drop, persistence, import, export, templates, keyboard shortcuts, or responsive behavior:

```bash
npm run test:e2e
```

## Resetting Local App State

The editor stores documents and UI preferences in browser LocalStorage. If the app appears to restore old content during development, clear site data for the local Vite origin in your browser or use the app's reset/delete document controls.

## Troubleshooting

| Symptom                                 | Likely cause                                | Action                                                         |
| --------------------------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| App opens with old documents            | LocalStorage persisted previous work        | Clear browser site data or delete documents from the workspace |
| E2E tests fail before opening a browser | Playwright browsers not installed           | Run `npx playwright install`                                   |
| Exported page shows old content         | Browser opened a previously downloaded file | Export again and open the newest download                      |
| Save fails with quota warning           | Browser storage limit reached               | Delete unused local documents or components                    |
