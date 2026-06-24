const LOCALE_KEY = "webdrop.locale";
const SUPPORTED_LOCALES = new Set(["en", "ja"]);

export function createOperationsI18n(messages, { onChange } = {}) {
  let locale = preferredLocale();
  const selector = document.querySelector("[data-operations-language]");

  function t(key, replacements = {}) {
    const template = messages[locale]?.[key] ?? messages.en?.[key] ?? key;
    if (typeof template !== "string") return template;
    return String(template).replace(/\{(\w+)\}/g, (_, name) => replacements[name] ?? `{${name}}`);
  }

  function apply() {
    document.documentElement.lang = locale;
    if (selector) selector.value = locale;
    for (const node of document.querySelectorAll("[data-i18n]")) {
      node.textContent = t(node.dataset.i18n);
    }
    for (const node of document.querySelectorAll("[data-i18n-aria]")) {
      node.setAttribute("aria-label", t(node.dataset.i18nAria));
    }
    document.title = t("documentTitle");
  }

  function setLocale(nextLocale) {
    locale = SUPPORTED_LOCALES.has(nextLocale) ? nextLocale : "en";
    localStorage.setItem(LOCALE_KEY, locale);
    apply();
    onChange?.(locale);
  }

  selector?.addEventListener("change", () => setLocale(selector.value));
  apply();

  return {
    apply,
    get locale() {
      return locale;
    },
    setLocale,
    t
  };
}

function preferredLocale() {
  const saved = localStorage.getItem(LOCALE_KEY);
  if (SUPPORTED_LOCALES.has(saved)) return saved;
  return /^ja\b/i.test(navigator.language || "") ? "ja" : "en";
}
