# HTML Audit

Packet: `.workflow/webdrop-audit-docs-qa/packets/html-audit.md`

Scope:
- Audited `index.html` for static HTML structure, accessibility, localization hooks, form/input correctness, and dead controls.
- Followed graph-first navigation. `query_graph` returned unrelated `src/services/anime-service.*` nodes, so the graph was stale/unrelated for this repo. Reads were kept scoped to `index.html`, directly linked `js/app.js`, `js/ui/app-view.js`, `js/core/controller.js`, `js/config/i18n.js`, `package.json`, and the specific CSS selector for `.send-confirm`.

## Findings

### High: Keyboard-accessible send fallback is present but permanently hidden

Refs:
- `index.html:236` defines the swipe-to-send control.
- `index.html:244` defines `<button class="sheet-primary send-confirm" type="button" data-action="send" hidden>`.
- `js/ui/app-view.js:123`-`js/ui/app-view.js:189` binds the send gesture through pointer events only.
- `js/core/controller.js:171`-`js/core/controller.js:172` wires both `send` and `swipe-send`, so the hidden button would work if exposed.
- `css/sheets.css:646`-`css/sheets.css:648` only styles `.send-confirm`; it does not reveal it.

The HTML contains a conventional Send button with a valid `data-action="send"`, but it has the `hidden` attribute and no scoped JS/CSS reference removes that attribute. After files are selected, the visible path is the custom swipe control. Because the swipe implementation is pointer-driven, keyboard-only users do not appear to have a visible way to submit the transfer even though the controller already supports one.

Recommendation:
- Reveal `.send-confirm` when files are selected, or provide an equivalent keyboard/click activation path for the swipe control.

### Medium: Avatar picker uses a custom listbox without listbox keyboard behavior

Refs:
- `index.html:142` creates `<div class="avatar-carousel" ... role="listbox">`.
- `js/ui/app-view.js:286`-`js/ui/app-view.js:307` renders focusable `<button role="option">` children and toggles `aria-selected`.

The custom listbox pattern does not include `keydown` handling for arrow keys, Home/End, or roving focus, and `html-validate@8.24.2` also flagged it with `prefer-native-element`. Because the options are already buttons, this may be simpler as a button group, or it needs the complete listbox interaction model.

Recommendation:
- Either remove the listbox/option roles and expose it as a labeled group of buttons, or implement a proper single-select listbox pattern.

### Low: Ring color swatches rely on inline styles

Refs:
- `index.html:150`-`index.html:154`

Each ring color button sets `style="--swatch:..."`, which `html-validate@8.24.2` flags via `no-inline-style`. This is not currently a functional bug, but it makes the HTML carry presentation data and keeps the validator red.

Recommendation:
- Move swatch colors to CSS classes/data-attribute selectors, or generate them from the same JS config that owns the available ring choices.

### Low: Mutually exclusive option groups are still generic button groups

Refs:
- `index.html:149`-`index.html:154` profile ring choices
- `index.html:163`-`index.html:165` language choices
- `index.html:199`-`index.html:201` motion choices
- `js/ui/app-view.js:231`-`js/ui/app-view.js:240` sets `aria-pressed` for language/motion.
- `js/ui/app-view.js:308`-`js/ui/app-view.js:312` sets `aria-pressed` for ring choices.

These controls represent single selections, but they are modeled as pressed buttons. That can work visually, but radio-group semantics would communicate the mutual exclusivity more directly to assistive technologies.

Recommendation:
- Consider `role="radiogroup"` with radio-like buttons, or keep buttons but ensure the chosen option is announced clearly in the control label/state.

## Tiny HTML Fixes Applied

Changed file:
- `index.html`

Fixes:
- `index.html:1` changed `<!doctype html>` to `<!DOCTYPE html>`.
- `index.html:149`, `index.html:163`, `index.html:199`, and `index.html:236` added `role="group"` to divs that carry localized `aria-label` values.
- `index.html:159` added `type="text"` to the device-name input.

## Checks

Passed:
- `npm run check`

Static validator:
- `npx --yes html-validate@8.24.2 index.html` runs under Node 20 and now reports 6 remaining errors:
  - `index.html:142` `prefer-native-element` for the avatar listbox.
  - `index.html:150`-`index.html:154` `no-inline-style` for ring swatches.
- The initial latest `html-validate` install attempt failed because `html-validate@11.5.3` requires newer Node APIs than Node `v20.11.0`.

Scoped wiring checks:
- All static `data-action` values in `index.html` have matching controller handlers.
- Scoped `rg` found no JS path that queries or unhides `.send-confirm`.
