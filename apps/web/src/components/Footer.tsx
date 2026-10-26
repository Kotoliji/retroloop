import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function Footer() {
  const t = useTranslations("Footer");
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">Retroloop</span> — {t("tagline")}
        </p>
        <div className="flex items-center gap-4">
          <Link href="/privacy" className="hover:underline">
            {t("privacy")}
          </Link>
          <LanguageSwitcher />
        </div>
      </div>
    </footer>
  );
}
