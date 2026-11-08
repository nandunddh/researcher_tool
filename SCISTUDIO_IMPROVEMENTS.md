# SciStudio editor improvement notes

Recorded from the user's feedback on 2026-11-08. These are requested improvements, not completed features.

## Priority 1: Accurate editing controls

- Fix the text color control showing white when the selected text visibly appears blue. Inspect computed styles, inherited colors, theme colors, and gradients; the screenshot alone does not establish the cause.
- Show the actual selected text's font family, size, weight, alignment, and color. Distinguish mixed formatting and gradient text instead of showing an incorrect single color.
- Ensure changes apply to the intended text or selected words and persist through saving, reopening, preview, and export.
- Keep floating controls close to the selection without covering the content being edited.
- Fix low contrast labels and controls in the settings panel.

## Priority 2: More canvas space

- Provide clear, independent controls to hide and restore the left sections panel and right settings panel.
- Add a focus mode that hides both panels and keeps an obvious exit control.
- Recalculate canvas fit when panels change, preserve selection, and remember the user's panel preferences locally.
- Make the top toolbar compact and responsive so important actions remain easy to reach.

## Priority 3: Redesign the sample website

- Create a polished conference sample with clear typography, balanced spacing, readable navigation, strong imagery, and coherent colors.
- Improve hero, event details, scientific sessions, speakers, registration, testimonials, contact, and footer designs.
- Avoid duplicated venue/format information and overly long headlines that overwhelm the layout.
- Support desktop, tablet, and mobile views. Preserve existing client content when changing a design; do not silently replace saved websites.

## Priority 4: Advanced options that remain easy to use

- Prioritize direct canvas editing with contextual text, image, button, and section controls.
- Offer section design variants that preserve existing content when switching layouts.
- Support image upload/replacement, cropping and positioning, alt text, and background images or gradients.
- Offer spacing, alignment, section width, borders, shadows, and responsive visibility controls.
- Provide duplicate, reorder, hide, undo/redo, copy/paste style, and reset actions.
- Support reusable global fonts and colors, with automatic readable text colors when backgrounds change and a manual override.
- Keep common actions immediately accessible and place advanced settings behind optional controls.
- Make saved/unsaved status and save failures clear; preserve edits during normal navigation.

## Completion expectations

- Toolbar values agree with what is visibly rendered.
- Text and design changes survive save/reopen and appear consistently in preview and exported output.
- Both sidebars can be hidden and restored without losing editing state.
- The sample website looks intentional at all supported viewport sizes.
- A new user can select text, format it, replace an image, switch a section design, and preview the result without searching through the right sidebar.
