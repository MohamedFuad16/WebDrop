# Motion Research Result

## Accepted

- Sheets open in 340ms with `cubic-bezier(.16, 1, .3, 1)` and close in 240ms with `cubic-bezier(.4, 0, 1, 1)`.
- Backdrop fades in over 180ms and out over 140ms without animating blur.
- Continuous orbit and ring motion uses transform only; ring drift is slower than peers.
- Connected state pulses one background halo instead of scaling both avatars.
- Button press feedback uses a restrained `.97` scale.
- Theme and locale changes use the View Transition API when available.
- Sheet cleanup and chat focus follow transition completion with defensive fallbacks.
- Reduced motion stops orbit, ring, halo, and dock animations while preserving a short opacity-only sheet transition.
- Orbit motion can be paused from Settings and pauses while a sheet is open or orbit controls have focus.

## Rejected

- Permanent `will-change` declarations.
- Animated box shadows or backdrop filters.
- A global `.01ms !important` reduced-motion reset.

## Sources

- https://web.dev/articles/animations-guide
- https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Animation_performance_and_frame_rate
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion
- https://www.w3.org/TR/mediaqueries-5/#prefers-reduced-motion
- https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
- https://developer.mozilla.org/en-US/docs/Web/API/Element/transitionend_event
- https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/will-change
