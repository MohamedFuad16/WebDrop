# HTML and Accessibility Packet

## Scope

- Audited and edited `index.html` only.
- Preserved the existing topbar structure and concurrent Dynamic Island work.
- Confirmed the redundant top-center device status remains removed.
- Confirmed settings order is:
  1. Device name
  2. Profile icon
  3. Profile ring
  4. Language
  5. App information
  6. App version

## Fixes

- Added initial `role="status"`, `aria-hidden="true"`, `aria-atomic="true"`, and `inert` state to the closed Dynamic Island so it is unavailable to keyboard and assistive-technology users before JavaScript initializes it.
- Marked generated Dynamic Island avatars and QR scanner visuals as decorative because nearby names and QR instructions already provide the meaningful text.
- Made the topbar connection label an atomic polite status so connected-peer name changes are announced without announcing the full header.
- Disabled autocomplete and spellcheck for the device-name field while retaining its native label relationship and 22-character limit.

## Verification

- Ran the repository static check.
- Ran an HTML parser check with Python's standard-library `html.parser`.
- Reviewed the final diff to confirm no CSS or JavaScript files were changed by this packet.
