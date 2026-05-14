# Screenshot Catalog

Screenshots are stored under `public-docs/assets/screenshots/`. The names are descriptive so documentation can explain what each image proves without relying on numbered filenames.

## Screenshot Inventory

| Public filename                       | What it shows                                                             | Recommended docs                                    |
| ------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------- |
| `workspace-dashboard-empty.png`       | Empty local workspace with search, sort, and create actions               | Overview, Feature Tour, Persistence, Reviewer Guide |
| `template-gallery.png`                | Template selection dialog with document title field                       | Feature Tour, Reviewer Guide, Presentation          |
| `editor-main-empty-page.png`          | Main editor shell with block palette, canvas, toolbar, and page inspector | Overview, Feature Tour, Architecture                |
| `drag-drop-indicator.png`             | Palette image block being dragged with a calculated drop region           | Feature Tour, Drag And Drop, Presentation           |
| `landing-page-template-editor.png`    | Landing page template selected in editor mode with page settings          | Feature Tour                                        |
| `inspector-spacing-editor.png`        | Visual spacing editor for margin and padding                              | Feature Tour                                        |
| `inspector-typography-appearance.png` | Typography and appearance controls affecting a selected button            | Feature Tour, Testing notes                         |
| `inspector-image-source.png`          | Image source, alt text, fit, ratio, radius, and link controls             | Feature Tour, Security                              |
| `preview-mode-after-edits.png`        | Preview mode after content and inspector edits                            | Feature Tour                                        |
| `export-dialog.png`                   | Export modal with JSON and HTML actions                                   | Feature Tour, Persistence/Export, Presentation      |
| `exported-html-page.png`              | Exported HTML opened as a standalone browser file                         | Feature Tour, Persistence/Export, Reviewer Guide    |
| `keyboard-shortcuts-dialog.png`       | Keyboard shortcut dialog                                                  | Feature Tour, Command And History                   |
| `design-tokens-panel.png`             | Design token panel controlling colors, typography, and spacing            | Feature Tour, Data Model                            |
| `layer-tree-panel.png`                | Layer tree showing nested sections, columns, and blocks                   | Feature Tour, Data Model                            |
| `component-library-panel.png`         | Local component library tab with a saved button component                 | Feature Tour, Command And History                   |
| `mobile-breakpoint-preview.png`       | Mobile breakpoint preview of a portfolio page                             | Feature Tour, Drag And Drop, Limitations            |

## Presentation Copies

Presentation-ready copies live under `public-docs/assets/presentation/screenshots/`.

| Presentation filename     | Source screenshot                     | Intended slide        |
| ------------------------- | ------------------------------------- | --------------------- |
| `01-main-editor.png`      | `editor-main-empty-page.png`          | Title                 |
| `03-workspace.png`        | `workspace-dashboard-empty.png`       | Product demo snapshot |
| `03-template-gallery.png` | `template-gallery.png`                | Product demo snapshot |
| `03-inspector.png`        | `inspector-typography-appearance.png` | Product demo snapshot |
| `03-export.png`           | `export-dialog.png`                   | Product demo snapshot |
| `07-drop-indicator.png`   | `drag-drop-indicator.png`             | Drag and drop rules   |
| `11-template.png`         | `template-gallery.png`                | Demo sequence         |
| `11-edit.png`             | `inspector-image-source.png`          | Demo sequence         |
| `11-export.png`           | `export-dialog.png`                   | Demo sequence         |

## Screenshot Usage Rules

- Use public asset paths only.
- Add a short caption after each screenshot.
- Do not rely on images alone; state why the screenshot matters.
- Refresh screenshots after visible UI changes.
- Avoid screenshots that show private browser tabs, local usernames, private files, tokens, or unrelated extensions.
