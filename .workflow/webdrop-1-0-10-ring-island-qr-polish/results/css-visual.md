Accepted findings:
- Restore the visible ring at the avatar element, not the 44px button hit target.
- Keep `.peer-node button::before` removed to avoid duplicate rings.
- Force candidate and friend-strip avatar circles to white in dark mode.
- Hide Dynamic Island pill and cancel controls during closing.

Implemented:
- `.peer-node img` and `.peer-node .avatar-animation` now carry a single white border/background.
- Candidate, friend, and plus circles use white backgrounds and borders.
- Closing and closed island states set pill/cancel opacity to zero.
