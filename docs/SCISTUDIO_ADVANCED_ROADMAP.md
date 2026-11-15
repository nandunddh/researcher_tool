# SciStudio advanced builder roadmap

Updated: 2026-11-15. Status: planned; library research only, no new dependencies installed.

## Product direction
Build websites for any purpose, not only conferences. Differentiate through direct visual editing, reusable user-created components, consistent brand styling, responsive controls and dependable publishing. Existing editor appearance and saved sites must survive migration. Library levels Basic / Medium / Pro remain visible filters; all levels are accessible during testing.

## Current baseline and limits
Next.js/TypeScript provides the library and application pages, while the active editor still uses backend/static/app.js and index.html. Native content nodes and eight modern presets exist; this is not yet a complete nested visual editor. My sections is browser-local storage, not a synchronized account library. Published-site saves require explicit handling because draft/live separation is incomplete. Never mark these roadmap features complete based only on UI controls.

## Work in order

### 1. Editor foundation and library proof of concept — next
- Define a versioned document: site -> pages -> sections -> containers -> elements, stable IDs, properties, style tokens and breakpoint overrides.
- Prototype one existing navbar plus a hero in React with editable text, image and button children. Preserve the current studio shell.
- Evaluate Puck against custom dnd-kit composition; select one primary layout engine, not both for the same drag interaction.
- Add a reversible adapter for current schema_json; unsupported legacy components stay intact. Do not destructively rewrite saved sites.
- Acceptance: open an existing site, insert/edit/reorder the prototype, save, reload, preview and export without losing unrelated content. Verify keyboard interaction and desktop/mobile.

### 2. Direct visual editing
- Click to select, double-click to edit text; replace/upload images; edit button label and destination.
- Drag elements between valid containers; add resize handles, snap guides and keyboard move/resize controls.
- Default to responsive grid/flex placement. Offer constrained free positioning inside explicit containers, with breakpoint behavior and overflow limits; arbitrary absolute positioning must not break mobile layouts.
- Group, duplicate, delete, lock, hide per breakpoint; keep contextual controls outside selected content.
- Acceptance: undo/redo each operation; preserve selection through panel toggles; positions remain correct at different canvas zoom levels and after reload.

### 3. Custom reusable components
- Save a section or group as a component; expose named text, image, link and style fields.
- Store versions in the database under immutable organization/account IDs. Separate independent copies from linked instances; explicit update propagation.
- Add thumbnails, search, categories, rename, duplicate and delete with usage safeguards.
- Acceptance: access across sessions/devices; enforce ownership; modifying one independent instance does not modify another.

### 4. Global brand and responsive design
- Named color, typography, spacing, radius and button tokens; solid, gradient and image backgrounds.
- Global changes with explicit local overrides; desktop/tablet/mobile inheritance with reset-to-inherited controls.
- Image/SVG/icon asset picker, alt text, crop/focal point and optimized media delivery.
- Acceptance: tokens render consistently in canvas, preview and export; no horizontal overflow at narrow widths; edits on one breakpoint do not unexpectedly overwrite others.

### 5. Safe save and publishing
- Database draft revisions, debounced autosave, retry feedback, optimistic concurrency, version history and restore.
- Publish immutable releases separately from drafts; saving must never change the live release. Add explicit rollback and permission checks.
- Acceptance: failed saves do not show Saved; concurrent edits do not silently overwrite; restoring a draft does not publish it; cross-account access rejected.

### 6. Working website features
- Configurable forms, validated submissions, spam protection and organization-scoped inbox.
- Metadata, social previews, sitemap, analytics integration and consent-aware configuration where applicable.
- Add optional interaction presets with reduced-motion support; animations are optional and performance-budgeted.
- Acceptance: submissions reach the intended inbox; validation/error/success states work; published output and editor preview agree; no secret credentials in exported files.

## Candidate libraries and recommendation
Official documentation checked 2026-11-15. Confirm chosen versions, React/Next compatibility, bundle cost and licenses during the proof of concept.

| Library | Purpose | Decision |
| --- | --- | --- |
| [Puck](https://puckeditor.com/docs) | React visual composition using our own components; supports Next.js environments | Evaluate first as the editor foundation. It does not by itself solve arbitrary freeform positioning, persistence or tenant security. |
| [dnd-kit](https://dndkit.com/quickstart/) | Custom drag/drop interactions | Alternative foundation when Puck constraints block requirements; avoid competing drag engines on the same canvas. Verify which API generation is selected. |
| [Moveable](https://github.com/daybrush/moveable) | Drag, resize, rotate and snapping handles | Optional for explicit free-layout containers after zoom, keyboard and breakpoint behavior is proven. |
| [Tiptap](https://tiptap.dev/docs/editor/getting-started/overview) | Rich text editing and extensible formatting | Recommended for inline text. Open-source core; some advanced extensions/services are paid and are not assumed available. |
| [Motion](https://motion.dev/docs/react-accessibility) | React animation and transitions | Add later for optional presets; respect reduced-motion preference. |
| [shadcn/ui](https://ui.shadcn.com/docs) | Customizable editor UI controls | Use selectively for dialogs, menus and inspectors while preserving SciStudio styling; not a page-layout engine. |

Recommended first experiment: Puck + our React components, with Tiptap for rich text. Add Moveable only if the free-positioning prototype justifies it. Backend authorization, assets, autosave, revisions, forms and publishing remain our application responsibilities. Do not install all libraries upfront.

## Completion protocol for each task
Mark TODO -> IN PROGRESS -> VERIFIED. Include changed files, focused automated checks and visual desktop/mobile review. Test real save/reload and published rendering, not only screenshots. User runs development servers/builds unless requested otherwise.
