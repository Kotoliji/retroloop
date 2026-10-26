import type { Locale } from "next-intl";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { CreateRetroForm } from "@/components/CreateRetroForm";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const STEPS = ["write", "group", "discuss", "review"] as const;
const FEATURES = ["noSignup", "realtime", "exports", "mobile", "privacy"] as const;

export default function Landing({ params }: PageProps<"/[locale]">) {
  const { locale } = use(params);
  setRequestLocale(locale as Locale);
  const t = useTranslations("Landing");

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <span className="text-lg font-semibold tracking-tight">Retroloop</span>
        <LanguageSwitcher />
      </header>

      <main className="flex flex-col">
        <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 pt-12 pb-20 sm:pt-20">
          <p className="text-sm font-semibold tracking-wide text-emerald-700 uppercase dark:text-emerald-400">
            {t("eyebrow")}
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">{t("headline")}</h1>
          <p className="max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">{t("lead")}</p>
          <CreateRetroForm />
        </section>

        <section className="border-y border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="mx-auto grid w-full max-w-5xl gap-4 px-6 py-14 md:grid-cols-[1fr_2fr]">
            <h2 className="text-2xl font-semibold tracking-tight">{t("problemTitle")}</h2>
            <p className="text-lg text-zinc-700 dark:text-zinc-300">{t("problem")}</p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">{t("howTitle")}</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <li key={step} className="flex flex-col gap-2">
                <span className="flex size-8 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                  {i + 1}
                </span>
                <h3 className="font-semibold">{t(`steps.${step}.title`)}</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{t(`steps.${step}.body`)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto w-full max-w-5xl px-6 pb-16">
          <h2 className="text-2xl font-semibold tracking-tight">{t("featuresTitle")}</h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex gap-3 text-zinc-700 dark:text-zinc-300">
                <span aria-hidden className="text-emerald-600">
                  ✓
                </span>
                {t(`features.${feature}`)}
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-16">
            <h2 className="text-3xl font-semibold tracking-tight">{t("ctaTitle")}</h2>
            <p className="text-zinc-300 dark:text-zinc-600">{t("ctaBody")}</p>
            <CreateRetroForm inverted />
          </div>
        </section>
      </main>
    </div>
  );
}
