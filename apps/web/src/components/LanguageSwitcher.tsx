"use client";

import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

const NAMES: Record<Locale, string> = {
  en: "English",
  uk: "Українська",
  ru: "Русский",
  pt: "Português",
};

/** Switches the language and stays on the same page. */
export function LanguageSwitcher() {
  const t = useTranslations("Common");
  const locale = useLocale();
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();

  return (
    <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
      <span className="sr-only">{t("language")}</span>
      <select
        value={locale}
        onChange={(e) =>
          // pathname comes without the locale; params fill in dynamic segments like [retroId]
          router.replace({ pathname, params } as never, { locale: e.target.value as Locale })
        }
        className="rounded-lg border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
      >
        {routing.locales.map((l) => (
          <option key={l} value={l}>
            {NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
