"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { buttonClassName } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { FaceShapeIcon, paletteSwatches } from "@/components/scan/BeautyIcons";
import type {
  BeautyColour,
  BeautyFaceShape,
  BeautyPose,
  BeautyPoseKey,
  BeautyScanReport,
  BeautySkin,
  BeautySkinRegion,
  ShadeGroup,
} from "@/types/beauty-scan";

type Tab = "colour" | "shape" | "skin";

const HEX = /^#[0-9a-fA-F]{6}$/;
const safeHex = (hex: string | null | undefined) => (hex && HEX.test(hex) ? hex : undefined);

const POSE_CAPTION: Record<BeautyPoseKey, string> = {
  front: "poseFrontCaption",
  right: "poseRightCaption",
  left: "poseLeftCaption",
};

// Each colour axis drawn as what it measures: dark to light, soft to clear,
// cool to warm. Face proportions use the brand tint.
const AXIS_TRACK: Record<string, string> = {
  value: "linear-gradient(90deg,#3E2C2A,#9A7564,#F4E6DA)",
  chroma: "linear-gradient(90deg,#BBADA9,#D98C95,#EF3E6D)",
  warmth: "linear-gradient(90deg,#B7A7DA,#EAD8D2,#EDB061)",
};
const BRAND_TRACK = "linear-gradient(90deg,var(--color-primary-dim),var(--color-primary))";

const UNDERTONE_DISC: Record<string, string> = {
  warm: "linear-gradient(135deg,#F6D791,#E3956A)",
  cool: "linear-gradient(135deg,#DCCBF0,#E3A6C0)",
  neutral: "linear-gradient(135deg,#E8D2C4,#C9AFA9)",
};

type Level = "lo" | "mid" | "hi" | "off";
const LEVEL_DOT: Record<Level, string> = {
  lo: "bg-[#5BB98B]",
  mid: "bg-[#E3A950]",
  hi: "bg-[#D8687A]",
  off: "bg-border",
};

/** A measured colour as a small lit sphere — skin, hair. */
function Sphere({ hex, size = 28 }: { hex?: string; size?: number }) {
  return (
    <i
      className="block shrink-0 rounded-full shadow-[inset_0_-3px_6px_rgba(0,0,0,0.14),0_0_0_2px_#fff]"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 34% 30%, rgba(255,255,255,0.75), rgba(255,255,255,0) 40%), ${hex ?? "#E2B190"}`,
      }}
    />
  );
}

/** Overlapping palette dots, like swatches fanned on a counter. */
function Fan({ hexes, size = 20 }: { hexes: string[]; size?: number }) {
  return (
    <span className="flex">
      {hexes.map((hex, i) => (
        <i
          key={hex + i}
          className={cn("block rounded-full shadow-[0_0_0_2px_#fff]", i > 0 && "-ml-[7px]")}
          style={{ width: size, height: size, background: hex }}
        />
      ))}
    </span>
  );
}

/** A white section on the warm page, with a serif heading. */
function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="mt-2.5 rounded-2xl bg-surface p-3.5 ring-1 ring-border">
      {title && <h5 className="mb-1 font-display text-[17px] leading-snug font-normal text-canvas-ink">{title}</h5>}
      {children}
    </section>
  );
}

function Note({ warn, children }: { warn?: boolean; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "mt-2.5 rounded-xl px-3 py-2.5 text-[12.5px] leading-relaxed text-canvas-ink",
        warn ? "bg-warn-dim" : "bg-primary-dim"
      )}
    >
      {children}
    </p>
  );
}

function Caveat({ children }: { children?: React.ReactNode }) {
  return children ? <p className="mt-3.5 text-[11px] leading-relaxed text-text-faint">{children}</p> : null;
}

/** A 0-1 position on a coloured track, or "not measured". */
function Scale({
  track,
  label,
  verdict,
  position,
  low,
  mid,
  high,
  off,
}: {
  track: string;
  label: string;
  verdict: string;
  position: number;
  low: string;
  mid?: string;
  high: string;
  off?: boolean;
}) {
  return (
    <div className={cn("py-2.5", off && "opacity-50")}>
      <div className="flex justify-between text-[12.5px] text-canvas-ink">
        <span>{label}</span>
        <b className="font-semibold text-primary">{verdict}</b>
      </div>
      <div className="relative mt-[11px] mb-[7px] h-2 rounded-full" style={{ background: off ? "var(--color-surface-2)" : track }}>
        {!off && (
          <i
            className="absolute top-1/2 -mt-2 -ml-2 h-4 w-4 animate-[beauty-slide_0.8s_cubic-bezier(.2,.9,.3,1.1)_both] rounded-full bg-white shadow-[0_0_0_2px_var(--color-canvas-ink),0_4px_10px_-3px_rgba(0,0,0,0.4)]"
            style={{ left: `${Math.round(Math.max(0, Math.min(1, position)) * 100)}%` }}
          />
        )}
      </div>
      <div className="flex justify-between text-[10.5px] text-text-faint">
        <span>{low}</span>
        {mid && <span>{mid}</span>}
        <span>{high}</span>
      </div>
    </div>
  );
}

function PaletteIcon() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.7-1 1.2-1.9-.5-1-.1-2.3 1.2-2.3H17a4 4 0 0 0 4-4c0-5.4-4-9.8-9-9.8z" />
      <circle cx="7.6" cy="11" r="1.1" />
      <circle cx="10.4" cy="7.3" r="1.1" />
      <circle cx="15" cy="7.7" r="1.1" />
    </svg>
  );
}

/** A reading that couldn't be made this time: what happened, what to try,
 * and the way back to the camera. */
function RetryCard({ kind, remedy, text }: { kind: "shape" | "colour"; remedy?: string | null; text?: string | null }) {
  const t = useTranslations("diagnostic.beauty");
  const key = remedy && t.has(`retry.tips.${remedy}`) ? remedy : "cannot_measure";
  const tips = t.raw(`retry.tips.${key}`) as string[];
  return (
    <div className="mt-2.5 animate-[toast-in_0.3s_ease-out_both] rounded-[18px] bg-warn-dim px-4 pt-[18px] pb-4">
      <div className="mb-3 flex h-[46px] w-[46px] items-center justify-center rounded-full bg-surface text-warn">
        {kind === "shape" ? <FaceShapeIcon shape="oval" size={24} /> : <PaletteIcon />}
      </div>
      <h4 className="font-display text-[22px] leading-tight font-normal text-canvas-ink">{t(`retry.${kind}Title`)}</h4>
      {text && <p className="mt-2 text-[13px] leading-relaxed text-canvas-ink-muted">{text}</p>}
      <div className="mt-3.5 text-[10.5px] font-semibold tracking-[1.4px] text-canvas-ink-muted uppercase">{t("retryTipsTitle")}</div>
      <ol className="mt-2 flex flex-col gap-1.5">
        {tips.map((tip, i) => (
          <li key={tip} className="flex items-start gap-2.5 rounded-xl bg-surface px-3 py-2.5 text-[12.5px] leading-snug text-canvas-ink">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
              {i + 1}
            </span>
            {tip}
          </li>
        ))}
      </ol>
      <Link href="/scan" className={buttonClassName({ className: "mt-4 block w-full" })}>
        {t("retryButton")}
      </Link>
    </div>
  );
}

function ColourTab({ colour, shades }: { colour: BeautyColour; shades: ShadeGroup[] }) {
  const t = useTranslations("diagnostic.beauty");
  const season = colour.season;
  if (!season) {
    return <RetryCard kind="colour" remedy={colour.remedyKey} text={colour.remedyText ?? t("notRead")} />;
  }
  const categories = colour.palette?.categories ?? [];
  const evidence = colour.evidence;
  const undertone = colour.undertone ?? "neutral";
  // Real catalog shades closest to her palette, on a shelf she can swipe.
  const picks = shades.flatMap((g) =>
    g.matches.slice(0, 3).map((m) => ({ group: t.has(`category.${g.id}`) ? t(`category.${g.id}`) : g.label, m }))
  );

  return (
    <>
      <Section title={t("whySeason", { season: season.displayName })}>
        {colour.description && <p className="text-[13px] leading-[1.6] text-canvas-ink">{colour.description}</p>}
        {!season.conclusive && season.runnerUp && (
          <p className="mt-1.5 text-[12px] text-canvas-ink-muted">{t("closeTo", { season: season.runnerUp.displayName })}</p>
        )}
        <div className="mt-3.5 flex flex-wrap gap-x-[18px] gap-y-2.5 text-[12px] text-canvas-ink">
          {safeHex(evidence?.skin) && (
            <span className="flex items-center gap-2">
              <Sphere hex={safeHex(evidence?.skin)} />
              {t("skinSwatch")}
            </span>
          )}
          {evidence?.hasHair && safeHex(evidence.hair) && (
            <span className="flex items-center gap-2">
              <Sphere hex={safeHex(evidence.hair)} />
              {t("hair")}
            </span>
          )}
          <span className="flex items-center gap-2">
            <i className="block h-7 w-7 rounded-full shadow-[0_0_0_2px_#fff]" style={{ background: UNDERTONE_DISC[undertone] }} />
            {t("undertone", { value: t(`undertones.${undertone}`) })}
          </span>
        </div>
      </Section>

      {(colour.attributes?.length ?? 0) > 0 && (
        <Section title={t("axesTitle")}>
          <div className="divide-y divide-border">
            {colour.attributes!.map((a) => (
              <Scale
                key={a.axis}
                track={AXIS_TRACK[a.axis] ?? BRAND_TRACK}
                label={a.label}
                verdict={a.verdict}
                position={a.position}
                low={a.negativeLabel}
                high={a.positiveLabel}
                off={!a.measured}
              />
            ))}
          </div>
        </Section>
      )}

      {categories.length > 0 && (
        <Section title={t("paletteTitle")}>
          <div className="divide-y divide-border">
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between gap-3 py-2 text-[12.5px] text-canvas-ink">
                <span>{t.has(`category.${cat.id}`) ? t(`category.${cat.id}`) : cat.label}</span>
                <span className="flex gap-1.5">
                  {cat.swatches.map((s) =>
                    safeHex(s.hex) ? (
                      <i
                        key={s.name}
                        title={s.name}
                        className="block h-6 w-6 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] transition-transform hover:scale-[1.18]"
                        style={{ background: s.hex }}
                      />
                    ) : null
                  )}
                </span>
              </div>
            ))}
          </div>
          {colour.palette?.status === "placeholder" && <Caveat>{t("paletteDraft")}</Caveat>}
        </Section>
      )}

      {picks.length > 0 && (
        <>
          <div className="mt-5 text-[10.5px] font-semibold tracking-[1.4px] text-canvas-ink-muted uppercase">{t("shadesTitle")}</div>
          <div className="no-scrollbar -mx-[18px] mt-2.5 flex snap-x snap-mandatory scroll-px-[18px] gap-2 overflow-x-auto px-[18px] pb-1.5">
            {picks.map(({ group, m }) => (
              <Link
                key={m.productId}
                href={`/product/${encodeURIComponent(m.parentSku)}`}
                title={t("closestTo", { swatch: m.swatchName })}
                className="flex w-32 shrink-0 snap-start flex-col overflow-hidden rounded-2xl bg-surface ring-1 ring-border"
              >
                <span className="relative block h-14" style={{ background: safeHex(m.colorHex) ?? "#eee" }}>
                  <span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[9.5px] font-semibold tracking-[0.5px] text-canvas-ink uppercase">
                    {group}
                  </span>
                </span>
                <span className="flex flex-1 flex-col px-2.5 pt-2 pb-2.5">
                  <small className="text-[9.5px] tracking-[0.8px] text-canvas-ink-muted uppercase">{m.brand}</small>
                  <span className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-canvas-ink">
                    {m.colorName ? `${m.colorName} · ` : ""}
                    {m.name}
                  </span>
                  <b className="mt-auto pt-1.5 text-[12.5px] font-semibold text-canvas-ink">Rp {m.price.toLocaleString("id-ID")}</b>
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
      {colour.remedyText && <Note>{colour.remedyText}</Note>}
      <Caveat>{colour.caveat}</Caveat>
    </>
  );
}

function ShapeTab({ shape }: { shape: BeautyFaceShape }) {
  const t = useTranslations("diagnostic.beauty");
  if (!shape.shape) {
    return <RetryCard kind="shape" remedy={shape.source?.remedy} text={shape.remedyText ?? t("notRead")} />;
  }
  const approximate = shape.source?.quality === "approximate";
  const meta = [approximate ? t("approximate") : null, shape.alsoFitsText ?? t("confidence", { value: shape.shape.confidencePercent })]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      <Section>
        <div className="flex items-center gap-3.5">
          <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-primary-dim text-primary">
            <FaceShapeIcon shape={shape.shape.key} size={50} draw />
          </span>
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold tracking-[1.4px] text-canvas-ink-muted uppercase">{t("shapeKicker")}</div>
            <h4 className="mt-1 font-display text-[28px] leading-[1.05] font-normal tracking-[-0.01em] text-canvas-ink">
              {shape.shape.displayName}
            </h4>
            <p className="mt-1.5 text-[12px] text-canvas-ink-muted">{meta}</p>
          </div>
        </div>
        {shape.description && <p className="mt-3 text-[13px] leading-[1.6] text-canvas-ink">{shape.description}</p>}
        {approximate && shape.approximateNote && <Note warn>{shape.approximateNote}</Note>}
        <Caveat>{shape.coveredNote}</Caveat>
      </Section>

      {(shape.axes?.length ?? 0) > 0 && (
        <Section title={t("proportionsTitle")}>
          <div className="divide-y divide-border">
            {shape.axes!.map((a) => (
              <Scale
                key={a.axis}
                track={BRAND_TRACK}
                label={a.label}
                verdict={a.verdict}
                position={a.position}
                low={a.lowLabel}
                mid={a.midLabel}
                high={a.highLabel}
              />
            ))}
          </div>
        </Section>
      )}

      {(shape.looks?.ranked.length ?? 0) > 0 && (
        <Section title={shape.looks!.title}>
          <div className="divide-y divide-border">
            {shape.looks!.ranked.map((look) => (
              <div key={look.key} className="grid grid-cols-[60px_1fr] gap-3 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={/^https?:\/\//.test(look.imageUrl) ? look.imageUrl : undefined}
                  alt={look.displayName}
                  loading="lazy"
                  className="h-[76px] w-[60px] rounded-[10px] bg-surface-2 object-cover"
                  onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                />
                <div className="min-w-0">
                  <b className="block text-[13px] font-semibold text-canvas-ink">{look.displayName}</b>
                  <span
                    className={cn(
                      "mt-1 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                      look.tier === "best"
                        ? "bg-[#E3F3EA] text-[#2B7451]"
                        : look.tier === "one_touch"
                          ? "bg-[#FBEBD5] text-[#94601A]"
                          : "bg-surface-2 text-canvas-ink-muted"
                    )}
                  >
                    {look.fitLabel}
                  </span>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-canvas-ink-muted">{look.note || look.character}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
      <Caveat>{shape.caveat}</Caveat>
    </>
  );
}

const FINDINGS: [keyof BeautySkinRegion, string][] = [
  ["bersinar", "shine"],
  ["pori_besar", "pores"],
  ["noda_hitam", "spots"],
  ["jerawat", "acne"],
  ["garis_halus", "lines"],
];

function SkinTab({
  skin,
  skinHex,
  poses,
  thumbs,
}: {
  skin: BeautySkin;
  skinHex?: string;
  poses: BeautyPose[];
  thumbs: Partial<Record<BeautyPoseKey, string>>;
}) {
  const t = useTranslations("diagnostic.beauty");
  const fromSides = skin.analysis.detail.some((d) => d.source !== "front");
  const rejected = poses.filter((p) => p.pose !== "front" && !p.accepted);

  /** What a region shows, and how much. */
  function findings(d: BeautySkinRegion): { words: string; level: Level } {
    if (!d.measured) return { words: t("regionNotRead"), level: "off" };
    const words: string[] = [];
    let level: Level = "lo";
    for (const [key, word] of FINDINGS) {
      const v = d[key];
      if (typeof v !== "number") continue;
      if (v >= 0.6) {
        words.push(t("findingHigh", { finding: t(`finding.${word}`) }));
        level = "hi";
      } else if (v >= 0.3) {
        words.push(t("findingSome", { finding: t(`finding.${word}`) }));
        if (level === "lo") level = "mid";
      }
    }
    if (d.warna_kulit_merata != null && d.warna_kulit_merata < 0.5) {
      words.push(t("finding.uneven"));
      if (level === "lo") level = "mid";
    }
    return { words: words.length ? words.join(", ") : t("nothingStandsOut"), level };
  }

  return (
    <>
      <Section>
        <div className="flex items-center gap-3.5">
          <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-primary-dim">
            <Sphere hex={skinHex} size={40} />
          </span>
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold tracking-[1.4px] text-canvas-ink-muted uppercase">{t("skinKicker")}</div>
            <h4 className="mt-1 font-display text-[28px] leading-[1.05] font-normal tracking-[-0.01em] text-canvas-ink">
              {skin.analysis.summary}
            </h4>
            <p className="mt-1.5 text-[12px] text-canvas-ink-muted">{fromSides ? t("skinFrom3") : t("skinFrom1")}</p>
          </div>
        </div>

        {Object.keys(thumbs).length > 0 && (
          <div className="mt-3.5 grid grid-cols-3 gap-2">
            {(["front", "right", "left"] as BeautyPoseKey[]).map((key) => {
              const info = poses.find((p) => p.pose === key);
              const used = key === "front" || info?.accepted;
              return (
                <figure key={key} className="relative overflow-hidden rounded-xl bg-surface-2">
                  {thumbs[key] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbs[key]}
                      alt=""
                      className={cn("block aspect-[3/4] w-full object-cover", !used && "opacity-40 grayscale")}
                    />
                  )}
                  <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[rgba(20,14,18,0.78)] to-transparent px-[7px] pt-[18px] pb-1.5 text-[10px] leading-tight text-white">
                    {t(POSE_CAPTION[key])}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        )}
        {rejected.map((p) => (
          <Note key={p.pose} warn>
            {t("poseRejected", {
              pose: t(POSE_CAPTION[p.pose]),
              reason: t.has(`poseReason.${p.reason}`) ? t(`poseReason.${p.reason}`) : p.reason,
            })}
          </Note>
        ))}
      </Section>

      <Section title={t("regionsTitle")}>
        <div className="mt-1 flex gap-3.5 text-[10.5px] text-canvas-ink-muted">
          {(["lo", "mid", "hi"] as Level[]).map((level, i) => (
            <span key={level} className="flex items-center gap-1.5">
              <i className={cn("block h-[7px] w-[7px] rounded-full", LEVEL_DOT[level])} />
              {t(`legend.${["fine", "some", "clear"][i]}`)}
            </span>
          ))}
        </div>
        <div className="divide-y divide-border">
          {skin.analysis.detail.map((d) => {
            const found = findings(d);
            return (
              <div key={d.tipe} className="flex items-start gap-2.5 py-2.5 text-[12.5px]">
                <i className={cn("mt-[5px] block h-2 w-2 shrink-0 rounded-full", LEVEL_DOT[found.level])} />
                <span className="flex-1 text-canvas-ink">
                  {d.label}
                  {d.source !== "front" && <small className="mt-0.5 block text-[10.5px] text-text-faint">{t("fromSide")}</small>}
                </span>
                <span className="flex-1 text-right text-canvas-ink-muted">{found.words}</span>
              </div>
            );
          })}
        </div>
      </Section>
      <Caveat>{skin.caveat}</Caveat>
    </>
  );
}

/** The beauty half of the scan report: colour season, face shape and skin
 * type from the three-pose scan (types/beauty-scan.ts). */
export function BeautyProfile({
  beauty,
  thumbs,
}: {
  beauty: BeautyScanReport;
  thumbs: Partial<Record<BeautyPoseKey, string>>;
}) {
  const t = useTranslations("diagnostic.beauty");
  const [tab, setTab] = useState<Tab>("colour");
  const colour = beauty.colour;
  const season = colour.season;
  const shape = beauty.faceShape.shape;
  const palette = paletteSwatches(colour, 8);
  const fan = paletteSwatches(colour, 4).map((s) => s.hex);
  const skinHex = safeHex(colour.evidence?.skin);
  // The headline is tinted with the season's own colours, so every result looks like its own.
  const heroTint =
    palette.length >= 2
      ? `linear-gradient(150deg, color-mix(in srgb, ${palette[0].hex} 20%, #fff), color-mix(in srgb, ${palette[1].hex} 16%, #fff))`
      : undefined;
  const notRead = <i className="block h-[26px] w-[26px] rounded-full border-[1.5px] border-dashed border-text-faint" />;

  const tiles: { key: Tab; label: string; value: string | null; art: React.ReactNode }[] = [
    { key: "colour", label: t("spec.colour"), value: season?.displayName ?? null, art: fan.length ? <Fan hexes={fan} /> : notRead },
    {
      key: "shape",
      label: t("spec.shape"),
      value: shape?.displayName ?? null,
      art: shape ? <FaceShapeIcon shape={shape.key} size={30} /> : notRead,
    },
    { key: "skin", label: t("spec.skin"), value: beauty.skin.analysis.summary, art: <Sphere hex={skinHex} size={26} /> },
  ];

  return (
    <section className="mb-5">
      <h3 className="mb-2.5 text-[12px] font-bold tracking-[0.8px] text-canvas-ink uppercase">{t("kicker")}</h3>

      {/* The headline: her photo, her season, and the season's colours */}
      <div
        className="animate-[toast-in_0.4s_ease-out_both] rounded-[22px] bg-primary-dim p-4"
        style={heroTint ? { background: heroTint } : undefined}
      >
        <div className="flex items-center gap-3.5">
          {thumbs.front && (
            <span className="block h-[92px] w-[72px] shrink-0 overflow-hidden rounded-t-full rounded-b-[14px] border-[3px] border-white bg-surface-2 shadow-[0_12px_22px_-12px_rgba(36,31,38,0.6)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbs.front} alt="" className="block h-full w-full object-cover" />
            </span>
          )}
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold tracking-[1.4px] text-canvas-ink-muted uppercase">
              {season ? t("seasonKicker") : t("kicker")}
            </div>
            <h4 className="mt-1.5 font-display text-[31px] leading-[1.02] font-normal tracking-[-0.015em] text-canvas-ink">
              {season ? season.displayName : t("title")}
            </h4>
            <p className="mt-1.5 text-[12px] text-canvas-ink-muted">
              {season
                ? `${t("confidence", { value: season.confidencePercent })} · ${t("undertone", {
                    value: t(`undertones.${colour.undertone ?? "neutral"}`),
                  })}`
                : t("retry.colourTitle")}
            </p>
          </div>
        </div>
        {palette.length > 0 && (
          <div className="mt-3.5 flex gap-[5px]">
            {palette.map((s, i) => (
              <i
                key={s.hex + s.name}
                title={s.name}
                className="block h-9 flex-1 origin-bottom animate-[beauty-rise_0.5s_cubic-bezier(.2,.9,.3,1.25)_both] rounded-[10px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]"
                style={{ background: s.hex, animationDelay: `${120 + i * 45}ms` }}
              />
            ))}
          </div>
        )}
      </div>

      {/* The three readings, each drawn from the result; they are the tabs too */}
      <div role="tablist" className="mt-2.5 grid grid-cols-3 gap-2">
        {tiles.map((tile) => (
          <button
            key={tile.key}
            type="button"
            role="tab"
            aria-selected={tab === tile.key}
            onClick={() => setTab(tile.key)}
            className={cn(
              "flex min-w-0 flex-col items-start rounded-2xl bg-surface p-2.5 text-left transition",
              tab === tile.key
                ? "shadow-[0_10px_20px_-14px_var(--color-primary)] ring-2 ring-primary"
                : "ring-1 ring-border hover:-translate-y-px"
            )}
          >
            <span className="flex h-[30px] items-center text-primary">{tile.art}</span>
            <small className="mt-2 text-[9.5px] font-semibold tracking-[1.2px] text-canvas-ink-muted uppercase">{tile.label}</small>
            <b
              className={cn(
                "mt-0.5 max-w-full truncate text-[12.5px]",
                tile.value ? "font-semibold text-canvas-ink" : "font-normal text-text-faint"
              )}
            >
              {tile.value ?? t("notReadShort")}
            </b>
          </button>
        ))}
      </div>

      <div key={tab} role="tabpanel" className="flex animate-[toast-in_0.3s_ease-out_both] flex-col">
        {tab === "colour" && <ColourTab colour={colour} shades={beauty.catalogShades ?? []} />}
        {tab === "shape" && <ShapeTab shape={beauty.faceShape} />}
        {tab === "skin" && <SkinTab skin={beauty.skin} skinHex={skinHex} poses={beauty.poses ?? []} thumbs={thumbs} />}
      </div>
    </section>
  );
}
