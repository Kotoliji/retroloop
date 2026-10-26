import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // Each language is launched to its own community, so every page lives under
  // a locale prefix that can be shared and indexed on its own.
  locales: ["en", "uk", "ru", "pt"],
  defaultLocale: "en",
});

export type Locale = (typeof routing.locales)[number];
