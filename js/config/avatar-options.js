export const AVATAR_OPTIONS = Array.from(
  { length: 8 },
  (_, index) => `assets/icons/avatars/user-${String(index + 1).padStart(2, "0")}.png`
);

export function animatedFramesForAvatar(avatar) {
  const index = AVATAR_OPTIONS.indexOf(avatar);
  if (index < 0) return [];
  return Array.from(
    { length: 6 },
    (_, frameIndex) => `assets/icons/animated/user-${index + 1}/frame-${frameIndex + 1}.png`
  );
}
