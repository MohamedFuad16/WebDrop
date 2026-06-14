# CSS Audit

## Scope

- Packet: `.workflow/webdrop-audit-docs-qa/packets/css-audit.md`
- Audited files: `css/base.css`, `css/orbit.css`, `css/connected.css`, `css/sheets.css`, `css/responsive.css`
- Graph-first note: `query_graph` only surfaced `MotionPreference` and `mockReducedMotion()` from unrelated `src/*` nodes, and `get_node` found no nodes for the five CSS files. I treated the graph as stale/unrelated for stylesheet navigation and kept reads scoped to the packet, the requested CSS files, `index.html`, `package.json`, and directly imported UI wiring in `js/app.js` / `js/ui/app-view.js`.

## Findings

### P2 - Fixed: system reduced-motion still allowed several CSS animations

- Files:
  - `css/responsive.css:37`
  - `css/orbit.css:285`
  - `css/orbit.css:303`
  - `css/orbit.css:335`
  - `css/connected.css:207`
- What was wrong: the `prefers-reduced-motion: reduce` block only disabled `.peer-node`, `.orbit-ring`, a dead `.identity-cluster::after` selector, and `.connection-tray`. It missed `.avatar-frame` frame cycling, connected peer ring pulses on `.avatar--self::before` / `.peer-overlap::before`, the actual `.identity-cluster` disconnect animation, and `.chat-row` message entrance animation.
- User impact: users with OS reduced-motion enabled could still see continuous avatar cycling, pulsing connected rings, disconnect blur/scale, and chat message entrance movement.
- Fix applied: replaced the dead `.identity-cluster::after` selector with `.identity-cluster` and added `.avatar-frame`, `.avatar--self::before`, `.peer-overlap::before`, and `.chat-row` to the reduced-motion animation shutdown list.
- Status: fixed in `css/responsive.css:37`.

## No Unresolved Severity Findings

- No CSS parse failures found in the browser. Loaded rule counts were `base.css: 33`, `orbit.css: 51`, `connected.css: 35`, `sheets.css: 92`, `responsive.css: 3`.
- No topbar overlap found at 360x740 or 320x680. Brand, status, and action buttons stayed separate, and the orbit scene fit inside the viewport.
- No framework/runtime overlay or console warnings/errors were observed during browser smoke checks.

## Refactor Opportunities

### P3 - Consolidate repeated avatar media sizing selectors

- Files:
  - `css/orbit.css:137`
  - `css/orbit.css:229`
  - `css/orbit.css:257`
  - `css/sheets.css:488`
- Several avatar surfaces repeat `width: 100%`, `height: 100%`, `border-radius: inherit`, and `object-fit: cover` for image and `.avatar-animation` children. A small shared selector for avatar media would reduce drift risk across peer nodes, self avatar, connected overlap, and carousel options.

### P3 - Tokenize repeated icon-stroke rules

- Files:
  - `css/base.css:239`
  - `css/connected.css:49`
  - `css/sheets.css:90`
  - `css/sheets.css:654`
- Button icon rules repeatedly set SVG size, transparent fill, currentColor stroke, round caps/joins, and stroke widths. A shared utility or custom properties for icon size/stroke width would make future icon changes less error-prone.

### P3 - Keep motion timing variables centralized

- Files:
  - `css/base.css:8`
  - `css/connected.css:207`
  - `css/sheets.css:300`
  - `css/sheets.css:341`
- Most motion uses tokens from `:root`, but a few local durations remain inline (`280ms`, `120ms`, `220ms`). This is not a current bug, but tokenizing them would make future reduced-motion and timing changes easier to audit.

## Changed Files

- `css/responsive.css`
- `.workflow/webdrop-audit-docs-qa/results/css-audit.md`

Unrelated/concurrent work left untouched:

- `index.html` was already modified in the worktree.
- Several `.workflow/*` and `assets/diagrams/*` files are untracked.

## Check Evidence

- `npm run check` passed.
- Browser plugin smoke test at `http://127.0.0.1:4178/`:
  - Page identity: `WebDrop v2`
  - Meaningful content present: `WebDrop`, nearby peers, device name
  - Console warnings/errors: none
  - Settings sheet opened and rendered with `data-sheet-open="true"`
  - Manual motion setting changed `data-motion` to `paused`; peer, ring, and avatar-frame animation play state reported `paused`
- Clean-port post-edit browser verification at `http://127.0.0.1:4179/`:
  - App rendered with no console warnings/errors
  - Parsed `responsive.css` media query included `.avatar-frame`, `.identity-cluster`, and `.chat-row`
- Responsive checks:
  - 360x740: no brand/status/actions overlap; orbit fit viewport
  - 320x680: no brand/status/actions overlap; orbit fit viewport
- Direct stylesheet check:
  - `curl http://127.0.0.1:4178/css/responsive.css?audit=postedit` returned the updated reduced-motion selector list.
