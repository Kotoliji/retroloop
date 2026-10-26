import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Footer } from "@/components/Footer";
import { Link } from "@/i18n/navigation";

const SECTIONS = ["store", "browser", "analytics", "retention"] as const;
const UPDATED = "2026-10-26";

/** Shown on the page so people know whom to ask; set it when deploying. */
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

export async function generateMetadata({ params }: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Privacy" });
  return { title: `${t("title")} — Retroloop` };
}

export default function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = use(params);
  setRequestLocale(locale as Locale);
  const t = useTranslations("Privacy");

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto w-full max-w-3xl px-6 py-5">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Retroloop
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-zinc-500">{t("updated", { date: UPDATED })}</p>
          <p className="text-lg text-zinc-700 dark:text-zinc-300">{t("intro")}</p>
        </div>
        {SECTIONS.map((section) => (
          <section key={section} className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold">{t(`${section}Title`)}</h2>
            <p className="text-zinc-700 dark:text-zinc-300">{t(section)}</p>
          </section>
        ))}
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">{t("contactTitle")}</h2>
          <p className="text-zinc-700 dark:text-zinc-300">
            {CONTACT_EMAIL ? t("contact", { email: CONTACT_EMAIL }) : t("contactFallback")}
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
