export const AVATAR_OPTIONS = Array.from(
  { length: 9 },
  (_, index) => `assets/icons/avatars/user-${String(index + 1).padStart(2, "0")}.png`
);

export function animatedFramesForAvatar(avatar) {
  const index = AVATAR_OPTIONS.indexOf(normalizeAvatarChoice(avatar));
  if (index <= 0) return [];
  const frameSet = index;
  return Array.from(
    { length: 6 },
    (_, frameIndex) => `assets/icons/animated/user-${frameSet}/frame-${frameIndex + 1}.png`
  );
}

export function normalizeAvatarChoice(avatar) {
  const raw = String(avatar || "").trim();
  if (!raw) return AVATAR_OPTIONS[0];
  const fileMatch = raw.match(/user[-_]?(\d{1,2})\.png$/i) || raw.match(/^user[-_]?(\d{1,2})$/i);
  if (fileMatch) {
    const number = Number(fileMatch[1]);
    const normalized = `assets/icons/avatars/user-${String(number).padStart(2, "0")}.png`;
    return AVATAR_OPTIONS.includes(normalized) ? normalized : AVATAR_OPTIONS[0];
  }
  return AVATAR_OPTIONS.includes(raw) ? raw : AVATAR_OPTIONS[0];
}

export function randomAvatarChoice() {
  const array = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(array);
    return AVATAR_OPTIONS[array[0] % AVATAR_OPTIONS.length];
  }
  return AVATAR_OPTIONS[Math.floor(Math.random() * AVATAR_OPTIONS.length)];
}
