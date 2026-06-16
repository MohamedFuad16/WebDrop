export const AVATAR_OPTIONS = Array.from(
  { length: 9 },
  (_, index) => `assets/icons/avatars/user-${String(index + 1).padStart(2, "0")}.png`
);

export function animatedFramesForAvatar(avatar) {
  const index = AVATAR_OPTIONS.indexOf(avatar);
  if (index <= 0) return [];
  const frameSet = index;
  return Array.from(
    { length: 6 },
    (_, frameIndex) => `assets/icons/animated/user-${frameSet}/frame-${frameIndex + 1}.png`
  );
}

export function normalizeAvatarChoice(avatar) {
  if (!avatar) return AVATAR_OPTIONS[0];
  if (avatar === "assets/icons/avatars/user-09.png") return AVATAR_OPTIONS[0];
  return AVATAR_OPTIONS.includes(avatar) ? avatar : AVATAR_OPTIONS[0];
}
