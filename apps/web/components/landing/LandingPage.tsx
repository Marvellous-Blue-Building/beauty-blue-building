import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { btnPrimaryCls, btnSecondaryCls } from "@/components/admin/glass";
import {
  IconArrowRight,
  IconBox,
  IconChart,
  IconChat,
  IconCode,
  IconHistory,
  IconMenu,
  IconSearch,
  IconSparkle,
  IconTrend,
} from "@/components/admin/icons";

/**
 * Public landing page — same glassmorphism theme as the admin
 * (docs/admin-ui-guidelines.md). Every screenshot under /landing/{locale}/ is a
 * real capture of the app, regenerated with `npm run screenshots:landing`.
 */

const SNIPPET = '<script src="https://<your-domain>/widget-loader.js" async></script>';

function Shot({ src, alt, width, height, className, priority }: { src: string; alt: string; width: number; height: number; className?: string; priority?: boolean }) {
  return <Image src={src} alt={alt} width={width} height={height} priority={priority} sizes="(min-width: 1024px) 60vw, 100vw" className={className} />;
}

/** Desktop screenshot inside a glass "browser window". */
function BrowserFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`glass-panel overflow-hidden rounded-[22px] p-1.5 ${className ?? ""}`}>
      <div className="flex items-center gap-1.5 px-3 py-2" aria-hidden>
        <span className="h-2.5 w-2.5 rounded-full bg-admin-rose" />
        <span className="h-2.5 w-2.5 rounded-full bg-admin-taupe" />
        <span className="h-2.5 w-2.5 rounded-full bg-admin-mint" />
      </div>
      <div className="overflow-hidden rounded-2xl">{children}</div>
    </div>
  );
}

/** Mobile screenshot inside a glass phone bezel. */
function PhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`glass-panel rounded-[34px] p-2 shadow-[0_30px_60px_-20px_rgb(64_64_64/0.35)] ${className ?? ""}`}>
      <div className="overflow-hidden rounded-[27px] bg-white">{children}</div>
    </div>
  );
}

function SectionTitle({ eyebrow, title, subtitle, id }: { eyebrow?: string; title: string; subtitle?: string; id?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow && <div className="text-xs font-semibold uppercase tracking-[0.14em] text-admin-accent-strong">{eyebrow}</div>}
      <h2 id={id} className="mt-2 text-3xl font-semibold tracking-tight text-neutral-700 sm:text-4xl">
        {title}
      </h2>
      {subtitle && <p className="mt-3 text-base leading-relaxed text-neutral-500">{subtitle}</p>}
    </div>
  );
}

export async function LandingPage({ locale, productCount }: { locale: string; productCount: number | null }) {
  const t = await getTranslations("landing");
  const shots = `/landing/${locale === "id" ? "id" : "en"}`;
  const nf = (n: number) => n.toLocaleString(locale === "id" ? "id-ID" : "en-US");

  // Seller order: the two dashboard pillars, then the customer-facing advisor.
  const anchors = [
    { href: "#sales-intel", label: t("nav.salesIntel") },
    { href: "#demand-signal", label: t("nav.forecasting") },
    { href: "#features", label: t("nav.features") },
    { href: "#retailers", label: t("nav.retailers") },
    { href: "#faq", label: t("nav.faq") },
  ];
  // Placeholders kept from the previous landing page until their content exists.
  const placeholders = [t("nav.pricing"), t("nav.about"), t("nav.contact")];

  const facts = [
    productCount != null && { value: nf(productCount), label: t("facts.products") },
    { value: "3", label: t("facts.poses") },
    { value: "2", label: t("facts.languages") },
    { value: "1", label: t("facts.script") },
  ].filter(Boolean) as { value: string; label: string }[];

  const steps = [
    { n: "01", icon: <IconSearch size={22} />, title: t("how.s1.title"), body: t("how.s1.body") },
    { n: "02", icon: <IconSparkle size={22} />, title: t("how.s2.title"), body: t("how.s2.body") },
    { n: "03", icon: <IconBox size={22} />, title: t("how.s3.title"), body: t("how.s3.body") },
  ];

  // Pillar 3's four shade categories; the swatches are decorative, not a customer's result.
  const shadeKeys = [
    { key: "eyeshadow", swatches: ["#c98b9c", "#8e5a6e", "#d9b8a8"] },
    { key: "lipstick", swatches: ["#c4566f", "#a63f58", "#e08a96"] },
    { key: "blush", swatches: ["#f0a8a8", "#e28a8f", "#f6c6bd"] },
    { key: "base", swatches: ["#f1d3bd", "#e3b796", "#c99772"] },
  ] as const;

  const faqs = [1, 2, 3, 4, 5].map((i) => ({ q: t(`faq.q${i}`), a: t(`faq.a${i}`) }));

  return (
    <div
      className="admin-theme fixed inset-0 z-[999999] overflow-y-auto overflow-x-hidden scroll-smooth bg-admin-cream bg-cover bg-fixed bg-center font-admin text-admin-ink"
      style={{ backgroundImage: "url(/admin/login-bg.jpg)" }}
    >
      {/* Light wash over the photo so copy stays readable over the busier corners. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-gradient-to-br from-white/45 via-white/20 to-white/35" />
      {/* Soft orbs behind the glass, as in the dashboard. */}
      <div aria-hidden className="pointer-events-none fixed -left-24 top-1/3 h-96 w-96 rounded-full bg-admin-rose/35 blur-3xl" />
      <div aria-hidden className="pointer-events-none fixed -right-20 top-10 h-80 w-80 rounded-full bg-admin-blush/60 blur-3xl" />

      {/* Nav */}
      <header className="sticky top-0 z-30 px-4 pt-4 sm:px-6">
        <nav className="glass-frame mx-auto flex max-w-[1240px] items-center gap-4 rounded-2xl px-4 py-3 sm:px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-admin-accent text-white shadow-[0_8px_20px_-6px_rgb(210_98_135/0.7)]">
              <IconSparkle size={18} />
            </span>
            <span className="whitespace-nowrap text-[15px] font-bold tracking-tight text-neutral-700">GlowOps</span>
          </Link>
          <div className="ml-4 hidden items-center gap-1 lg:flex">
            {anchors.map((a) => (
              <a key={a.href} href={a.href} className="rounded-lg px-3 py-2 text-sm text-admin-nav-ink transition hover:bg-white/50 hover:text-neutral-700">
                {a.label}
              </a>
            ))}
            {placeholders.map((label) => (
              <span key={label} className="hidden cursor-default px-3 py-2 text-sm text-admin-nav-ink/70 2xl:inline">
                {label}
              </span>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <LocaleSwitcher />
            <div className="hidden items-center gap-2 sm:flex">
              <Link href="/login" className={btnSecondaryCls}>
                {t("nav.login")}
              </Link>
              <a href="/demo-retailer.html" target="_blank" rel="noopener noreferrer" className={btnPrimaryCls}>
                {t("nav.tryScan")}
              </a>
            </div>
            <details className="relative lg:hidden">
              <summary className="glass-inset flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl text-neutral-700 [&::-webkit-details-marker]:hidden" aria-label="Menu">
                <IconMenu size={20} />
              </summary>
              <div className="glass-panel absolute right-0 top-12 z-40 flex w-56 flex-col gap-1 rounded-2xl p-2">
                {anchors.map((a) => (
                  <a key={a.href} href={a.href} className="rounded-xl px-3 py-2.5 text-sm text-neutral-700 hover:bg-white/60">
                    {a.label}
                  </a>
                ))}
                <div className="flex flex-col gap-1 sm:hidden">
                  <Link href="/login" className="rounded-xl px-3 py-2.5 text-sm text-neutral-700 hover:bg-white/60">
                    {t("nav.login")}
                  </Link>
                  <a href="/demo-retailer.html" target="_blank" rel="noopener noreferrer" className={`${btnPrimaryCls} mt-1`}>
                    {t("nav.tryScan")}
                  </a>
                </div>
              </div>
            </details>
          </div>
        </nav>
      </header>

      <main className="relative mx-auto max-w-[1240px] px-4 sm:px-6">
        {/* Hero */}
        <section className="grid items-center gap-12 pb-16 pt-14 lg:grid-cols-[1fr_1.15fr] lg:pt-20">
          <div>
            <span className="glass-inset inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-admin-accent-strong">
              <IconSparkle size={14} /> {t("hero.eyebrow")}
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight text-neutral-700 sm:text-5xl lg:text-[56px]">{t("hero.title")}</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-neutral-500">{t("hero.subtitle")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/demo-retailer.html" target="_blank" rel="noopener noreferrer" className={`${btnPrimaryCls} h-12 px-6 text-[15px]`}>
                {t("hero.ctaPrimary")}
                <IconArrowRight size={18} />
              </a>
              <a href="#retailers" className={`${btnSecondaryCls} h-12 px-6 text-[15px]`}>
                {t("hero.ctaSecondary")}
              </a>
            </div>
          </div>

          <div className="relative pb-10 pl-6 sm:pl-16">
            <BrowserFrame>
              <Shot src={`${shots}/desktop-admin-overview.jpg`} alt={t("hero.shotAlt")} width={2880} height={1800} priority className="h-auto w-full" />
            </BrowserFrame>
            <PhoneFrame className="absolute -bottom-2 left-0 w-[34%] min-w-[130px] max-w-[210px]">
              <Shot src={`${shots}/mobile-scan.jpg`} alt={t("hero.phoneAlt")} width={780} height={1180} priority className="h-auto w-full" />
            </PhoneFrame>
            <div className="absolute -top-5 right-4 hidden flex-col items-end gap-2 sm:flex">
              {[t("hero.chipSales"), t("hero.chipDemand"), t("hero.chipAdvisor")].map((c, i) => (
                <span key={c} className="glass-panel flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium text-neutral-700" style={{ marginRight: i * 18 }}>
                  <span className="h-2 w-2 rounded-full bg-admin-accent" />
                  {c}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* 3 Pillars overview */}
        <section aria-labelledby="pillars" className="pb-16">
          <SectionTitle id="pillars" eyebrow={t("pillars.eyebrow")} title={t("pillars.title")} />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              { n: "1", href: "#sales-intel", icon: <IconSparkle size={20} />, name: t("pillars.p1.name"), body: t("pillars.p1.body") },
              { n: "2", href: "#demand-signal", icon: <IconTrend size={20} />, name: t("pillars.p2.name"), body: t("pillars.p2.body") },
              { n: "3", href: "#features", icon: <IconChat size={20} />, name: t("pillars.p3.name"), body: t("pillars.p3.body"), shades: true },
            ].map((p) => (
              <a key={p.name} href={p.href} className="glass-card group relative flex flex-col rounded-[24px] p-6 transition hover:-translate-y-0.5 sm:p-7">
                <span className="absolute right-6 top-6 text-3xl font-semibold text-admin-accent/25">{p.n}</span>
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-admin-accent text-white shadow-[0_8px_20px_-8px_rgb(210_98_135/0.7)]">{p.icon}</span>
                <h3 className="mt-4 text-lg font-semibold text-neutral-700">{p.name}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-neutral-500">{p.body}</p>
                {p.shades && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {shadeKeys.map((sk) => (
                      <span key={sk.key} className="glass-inset inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-neutral-700">
                        <span className="h-2 w-2 rounded-full" style={{ background: sk.swatches[0] }} />
                        {t(`pillars.shades.${sk.key}`)}
                      </span>
                    ))}
                  </div>
                )}
              </a>
            ))}
          </div>
        </section>

        {/* Facts */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label} className="glass-card rounded-[22px] p-5 sm:p-6">
              <div className="text-3xl font-semibold tracking-tight text-neutral-700 sm:text-4xl">{f.value}</div>
              <div className="mt-1.5 text-sm text-neutral-500">{f.label}</div>
            </div>
          ))}
        </section>

        {/* Sales Intelligence */}
        <section aria-labelledby="sales-intel" className="scroll-mt-28 pb-24">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-admin-accent-strong">{t("salesIntel.eyebrow")}</div>
              <h2 id="sales-intel" className="mt-2 text-3xl font-semibold tracking-tight text-neutral-700 sm:text-4xl">
                {t("salesIntel.title")}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-neutral-500">{t("salesIntel.subtitle")}</p>
              <div className="glass-inset mt-6 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-neutral-700">
                <IconChat size={16} className="shrink-0 text-admin-accent-strong" />
                {t("salesIntel.sampleQ")}
              </div>
            </div>
            <BrowserFrame>
              <Shot src={`${shots}/desktop-admin-insight.jpg`} alt={t("salesIntel.shotAlt")} width={2880} height={1800} className="h-auto w-full" />
            </BrowserFrame>
          </div>
        </section>

        {/* Forecasting & Demand Signal */}
        <section aria-labelledby="demand-signal" className="scroll-mt-28 pb-24">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="relative pb-16 lg:order-2">
              <BrowserFrame>
                <Shot src={`${shots}/desktop-admin-forecasting.jpg`} alt={t("demandSignal.shotAlt")} width={2880} height={1800} className="h-auto w-full" />
              </BrowserFrame>
              {/* The event planner's timeline card, floating over the dashboard shot. */}
              <div className="absolute -bottom-2 -left-3 w-[72%] overflow-hidden rounded-2xl shadow-[0_30px_60px_-24px_rgb(64_40_48/0.5)] ring-1 ring-white/80 sm:-left-8">
                <Shot src={`${shots}/desktop-admin-events.jpg`} alt={t("demandSignal.eventsAlt")} width={2068} height={696} className="h-auto w-full" />
              </div>
            </div>
            <div className="lg:order-1">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-admin-accent-strong">{t("demandSignal.eyebrow")}</div>
              <h2 id="demand-signal" className="mt-2 text-3xl font-semibold tracking-tight text-neutral-700 sm:text-4xl">
                {t("demandSignal.title")}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-neutral-500">{t("demandSignal.subtitle")}</p>
              <ul className="mt-6 flex flex-col gap-3">
                {[
                  { icon: <IconChart size={18} />, key: "b1" },
                  { icon: <IconHistory size={18} />, key: "b2" },
                  { icon: <IconSparkle size={18} />, key: "b3" },
                ].map((b) => (
                  <li key={b.key} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-admin-accent/12 text-admin-accent-strong">{b.icon}</span>
                    <div>
                      <div className="text-[15px] font-semibold text-neutral-700">{t(`demandSignal.${b.key}.title`)}</div>
                      <div className="text-sm leading-relaxed text-neutral-500">{t(`demandSignal.${b.key}.body`)}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-neutral-400">{t("demandSignal.demoNote")}</p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section aria-labelledby="features" className="scroll-mt-28 pb-24">
          <SectionTitle id="features" eyebrow={t("features.eyebrow")} title={t("features.title")} subtitle={t("features.subtitle")} />
          <h3 className="mt-12 text-center text-sm font-semibold uppercase tracking-[0.14em] text-admin-nav-ink">{t("features.shadesTitle")}</h3>
          <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {shadeKeys.map((sk) => (
              <article key={sk.key} className="glass-card rounded-[22px] p-5">
                <div className="flex -space-x-1.5" aria-hidden>
                  {sk.swatches.map((c) => (
                    <span key={c} className="h-7 w-7 rounded-full ring-2 ring-white" style={{ background: c }} />
                  ))}
                </div>
                <h4 className="mt-4 text-base font-semibold text-neutral-700">{t(`features.shades.${sk.key}.name`)}</h4>
                <p className="mt-1 text-sm leading-relaxed text-neutral-500">{t(`features.shades.${sk.key}.body`)}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <article className="glass-card flex flex-col overflow-hidden rounded-[26px] p-6 sm:p-8">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-admin-accent/12 text-admin-accent-strong">
                <IconSearch size={22} />
              </span>
              <h3 className="mt-4 text-xl font-semibold text-neutral-700">{t("features.scan.title")}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">{t("features.scan.body")}</p>
              <div className="mt-6 flex flex-1 items-end justify-center gap-4">
                <PhoneFrame className="w-[46%] max-w-[230px]">
                  <Shot src={`${shots}/mobile-welcome.jpg`} alt={t("features.scan.alt")} width={780} height={1688} className="h-auto w-full" />
                </PhoneFrame>
                <PhoneFrame className="mb-8 w-[46%] max-w-[230px]">
                  <Shot src={`${shots}/mobile-scan.jpg`} alt={t("features.scan.alt")} width={780} height={1180} className="h-auto w-full" />
                </PhoneFrame>
              </div>
            </article>
            <article className="glass-card flex flex-col overflow-hidden rounded-[26px] p-6 sm:p-8">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-admin-accent/12 text-admin-accent-strong">
                <IconChat size={22} />
              </span>
              <h3 className="mt-4 text-xl font-semibold text-neutral-700">{t("features.chat.title")}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">{t("features.chat.body")}</p>
              <BrowserFrame className="mt-6">
                <Shot src={`${shots}/desktop-widget.jpg`} alt={t("features.chat.alt")} width={2880} height={1800} className="h-auto w-full" />
              </BrowserFrame>
            </article>
            {[
              { icon: <IconTrend size={22} />, title: t("features.routine.title"), body: t("features.routine.body") },
              { icon: <IconHistory size={22} />, title: t("features.progress.title"), body: t("features.progress.body") },
            ].map((f) => (
              <article key={f.title} className="glass-card flex items-start gap-4 rounded-[26px] p-6 sm:p-8">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-admin-accent/12 text-admin-accent-strong">{f.icon}</span>
                <div>
                  <h3 className="text-xl font-semibold text-neutral-700">{f.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">{f.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section aria-labelledby="how" className="scroll-mt-28 pb-24">
          <SectionTitle id="how" eyebrow={t("how.eyebrow")} title={t("how.title")} />
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {steps.map((s) => (
              <li key={s.n} className="glass-card relative rounded-[26px] p-6 sm:p-8">
                <span className="absolute right-6 top-6 text-4xl font-semibold text-admin-accent/25">{s.n}</span>
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-admin-accent text-white shadow-[0_8px_20px_-8px_rgb(210_98_135/0.7)]">{s.icon}</span>
                <h3 className="mt-5 text-lg font-semibold text-neutral-700">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Get started */}
        <section aria-labelledby="retailers" className="glass-frame scroll-mt-28 rounded-[32px] p-6 text-center sm:p-10 lg:rounded-[40px]">
          <div className="mx-auto max-w-xl">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-admin-accent-strong">{t("retailers.eyebrow")}</div>
            <h2 id="retailers" className="mt-2 text-3xl font-semibold tracking-tight text-neutral-700 sm:text-4xl">
              {t("retailers.title")}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-neutral-500">{t("retailers.subtitle")}</p>
            <div className="mt-6 text-left">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-neutral-500">
                <IconCode size={14} /> {t("retailers.snippetLabel")}
              </div>
              <pre className="overflow-x-auto rounded-xl bg-neutral-700 px-4 py-3 text-xs text-neutral-100">{SNIPPET}</pre>
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/login" className={btnPrimaryCls}>
                {t("retailers.cta")}
                <IconArrowRight size={16} />
              </Link>
              <a href="/demo-retailer.html" target="_blank" rel="noopener noreferrer" className={btnSecondaryCls}>
                {t("retailers.preview")}
              </a>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section aria-labelledby="faq" className="scroll-mt-28 py-24">
          <SectionTitle id="faq" title={t("faq.title")} />
          <div className="mx-auto mt-10 flex max-w-3xl flex-col gap-3">
            {faqs.map((f) => (
              <details key={f.q} className="glass-card group rounded-2xl px-5 py-4 open:pb-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-neutral-700 [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/60 text-admin-accent-strong transition group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-3 text-[15px] leading-relaxed text-neutral-500">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="glass-card mb-10 rounded-[32px] px-6 py-12 text-center sm:px-12">
          <h2 className="text-3xl font-semibold tracking-tight text-neutral-700 sm:text-4xl">{t("cta.title")}</h2>
          <p className="mt-3 text-base text-neutral-500">{t("cta.subtitle")}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href="/demo-retailer.html" target="_blank" rel="noopener noreferrer" className={`${btnPrimaryCls} h-12 px-6 text-[15px]`}>
              {t("cta.primary")}
              <IconArrowRight size={18} />
            </a>
            <Link href="/login" className={`${btnSecondaryCls} h-12 px-6 text-[15px]`}>
              {t("cta.secondary")}
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-4 pb-8 text-sm text-neutral-500 sm:px-6">
        <span className="flex items-center gap-2">
          <IconSparkle size={16} className="text-admin-accent-strong" /> © {new Date().getFullYear()} {t("footer.rights")}
        </span>
        <div className="flex gap-4">
          {anchors.map((a) => (
            <a key={a.href} href={a.href} className="hover:text-neutral-700">
              {a.label}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}
