import { Document, Page, View, Text, Svg, Circle, Rect, Path, Defs, LinearGradient, Stop, Image, StyleSheet } from "@react-pdf/renderer";
import { scoreBand, METRIC_KEYS, type ScoreBand, type MetricKey } from "@/lib/scan/score-bands";
import { reportStrings, interpolate } from "@/lib/email/report-strings";
import type { FlaggedZone, ScanReport } from "@/types/scan";

/**
 * Standalone @react-pdf/renderer document mirroring
 * app/[locale]/scan/report/page.tsx section-for-section (ScoreRing, band
 * verdict, strongest/weakest pills, face map + flagged areas incl. tips,
 * scores legend + per-metric cards, disclaimer) — a separate component
 * tree using react-pdf's own primitives, since the real page's
 * Tailwind/DOM markup can't render inside a PDF. Only the skin-scan
 * result is included on purpose — no questionnaire/quiz data. The report
 * page's "what happens next" CTA and retake-scan link are interactive-only
 * and deliberately omitted (a static PDF has nothing to navigate to).
 *
 * Hex values below are copied 1:1 from app/globals.css's @theme palette —
 * react-pdf can't read CSS custom properties, so these must be kept in
 * sync by hand if that palette ever changes.
 *
 * The live page's decorative glyphs (✦ ◎ ✓ ⓘ) are dropped here — react-pdf's
 * built-in Helvetica only covers WinAnsi, so those render as garbled
 * fallback glyphs; "•" (in WinAnsi) stands in for ✦/◎ on the pills, and the
 * checkmark/info icons are dropped entirely in favor of the bold title text
 * alone, which already carries the same meaning.
 */

const PALETTE = {
  bg: "#faf3ed",
  surface: "#fffdfb",
  surface2: "#f2e4d9",
  border: "#e6d7cb",
  ink: "#523f38",
  inkMuted: "#8a7468",
  primary: "#a67b6b",
  primaryDim: "#f2e3dd",
  mintDim: "#fbeae3",
  warn: "#b5541c",
  warnDim: "#f4e1d2",
};

const BAND_COLOR: Record<ScoreBand, string> = {
  great: "#c2a67a", // secondary
  good: "#a67b6b", // primary
  fair: "#e0a996", // mint
  needsCare: "#b5541c", // warn
};

const BAND_BAR_GRADIENT: Record<ScoreBand, [string, string]> = {
  great: ["#f4ecd9", "#c2a67a"], // secondary-dim -> secondary
  good: ["#e0a996", "#a67b6b"], // mint -> primary
  fair: ["#fbeae3", "#e0a996"], // mint-dim -> mint
  needsCare: ["#e0a996", "#b5541c"], // mint -> warn
};

// Matches components/scan/FaceMap.tsx's SEVERITY_MARKER exactly (low/medium/high
// concern severity — unrelated to the 0-100 metric score bands above).
const SEVERITY_COLOR: Record<FlaggedZone["severity"], string> = {
  low: "#e0a996", // mint
  medium: "#a67b6b", // primary
  high: "#b5541c", // warn
};

// Mirrors components/scan/FaceMap.tsx's FALLBACK_POSITIONS. The PDF only
// ever has the raw captured frame (image_data) — the interactive report's
// imageCrop mapping is never persisted — so marker placement always uses
// this same keyword-matched fallback the live UI itself falls back to for
// zones without exact crop-relative coordinates.
const FALLBACK_POSITIONS: { match: string[]; x: number; y: number }[] = [
  { match: ["forehead", "sebum", "shine"], x: 0.5, y: 0.17 },
  { match: ["under_eye", "under-eye", "under eye", "eye"], x: 0.3, y: 0.42 },
  { match: ["redness", "erythema"], x: 0.72, y: 0.55 },
  { match: ["cheek", "texture"], x: 0.28, y: 0.55 },
  { match: ["nose", "pore", "t-zone"], x: 0.5, y: 0.52 },
  { match: ["chin", "mandible", "barrier"], x: 0.5, y: 0.8 },
];

function markerPosition(zone: FlaggedZone): { x: number; y: number } {
  const name = `${zone.key ?? ""} ${zone.zone}`.toLowerCase();
  const found = FALLBACK_POSITIONS.find((entry) => entry.match.some((k) => name.includes(k)));
  return found ?? FALLBACK_POSITIONS[0];
}

// Mirrors components/scan/MetricIcon.tsx's path data exactly (same simple
// line icons, drawn with currentColor there — stroke set explicitly here
// since react-pdf has no "currentColor").
const METRIC_ICON_PATH: Record<MetricKey, string> = {
  hydration: "M12 3.5c3 3.6 5.5 6.7 5.5 9.8a5.5 5.5 0 0 1-11 0c0-3.1 2.5-6.2 5.5-9.8Z",
  elasticity: "M3 12c2.2-4 4.4-4 6.6 0s4.4 4 6.6 0 3.6-3 4.8-1.5",
  pigmentation:
    "M12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9ZM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  texture: "M3 8c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 13c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 18c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0",
  pores: "M7 7h.01M12 7h.01M17 7h.01M7 12h.01M12 12h.01M17 12h.01M7 17h.01M12 17h.01M17 17h.01",
};

const FACE_W = 140;
const FACE_H = 204; // ~11/16 ratio, matching FaceMap.tsx's aspect-[11/16]

// A4 width (595.28pt) minus the page's own 32pt padding minus the metric
// card's own 10pt padding, each side — the exact inner width the progress
// bar fills, matching MetricCard.tsx's full-width bar track.
const METRIC_TRACK_W = 595.28 - 32 * 2 - 10 * 2;

const styles = StyleSheet.create({
  page: { backgroundColor: PALETTE.bg, padding: 32, fontSize: 10, color: PALETTE.ink },
  stepLabel: { fontSize: 9, letterSpacing: 1.5, color: PALETTE.inkMuted, marginBottom: 10, textTransform: "uppercase" },
  verdictCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: PALETTE.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: PALETTE.border,
    padding: 16,
    marginBottom: 12,
  },
  ringWrap: { width: 112, height: 112, position: "relative" },
  ringCenter: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreNum: { fontSize: 30, fontWeight: 700 },
  scoreOutOf: { fontSize: 9, color: PALETTE.inkMuted, marginTop: 4, letterSpacing: 0.4, textTransform: "uppercase" },
  bandBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: PALETTE.border,
    backgroundColor: PALETTE.surface,
    borderRadius: 20,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  bandDot: { width: 6, height: 6, borderRadius: 3 },
  bandLabel: { fontSize: 8, fontWeight: 700 },
  verdictTitle: { fontSize: 13, fontWeight: 700, marginBottom: 3 },
  verdictBody: { fontSize: 9, color: PALETTE.inkMuted, lineHeight: 1.4 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 20 },
  strongestPill: {
    borderRadius: 20,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.border,
    paddingVertical: 4,
    paddingHorizontal: 9,
    fontSize: 8.5,
    fontWeight: 700,
    color: PALETTE.ink,
  },
  focusPill: {
    borderRadius: 20,
    backgroundColor: PALETTE.warnDim,
    paddingVertical: 4,
    paddingHorizontal: 9,
    fontSize: 8.5,
    fontWeight: 700,
    color: PALETTE.warn,
  },
  sectionTitle: { fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 },
  scaleHint: { fontSize: 8.5, color: PALETTE.inkMuted },
  faceMapCard: {
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderRadius: 22,
    backgroundColor: PALETTE.surface,
    padding: 16,
    marginBottom: 20,
    alignItems: "center",
  },
  faceMapWrap: { width: FACE_W, height: FACE_H, position: "relative" },
  faceMapImage: {
    width: FACE_W,
    height: FACE_H,
    borderRadius: 24,
    objectFit: "cover",
  },
  faceMapPlaceholder: {
    width: FACE_W,
    height: FACE_H,
    borderRadius: 24,
    backgroundColor: PALETTE.surface2,
  },
  faceMarker: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2.5,
    backgroundColor: PALETTE.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  faceMarkerText: { fontSize: 8.5, fontWeight: 700, color: PALETTE.ink, fontFamily: "Courier-Bold" },
  bandLegendRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  bandLegendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  bandLegendLabel: { fontSize: 8.5, color: PALETTE.inkMuted },
  areaRow: {
    width: "100%",
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderRadius: 16,
    padding: 12,
    marginTop: 8,
    backgroundColor: PALETTE.bg,
  },
  areaHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  areaMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  areaMarkerText: { fontSize: 11, fontWeight: 700, color: PALETTE.surface, fontFamily: "Courier-Bold" },
  areaTitle: { fontSize: 10.5, fontWeight: 700, flex: 1 },
  areaSeverity: {
    fontSize: 7.5,
    fontWeight: 700,
    color: PALETTE.inkMuted,
    borderWidth: 1,
    borderColor: PALETTE.border,
    backgroundColor: PALETTE.surface,
    borderRadius: 10,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  areaBody: { fontSize: 9, color: PALETTE.inkMuted, lineHeight: 1.4, paddingLeft: 32 },
  areaTip: { fontSize: 9, color: PALETTE.ink, lineHeight: 1.4, paddingLeft: 32, marginTop: 4 },
  noAreas: { textAlign: "center", paddingTop: 14, width: "100%" },
  metricCard: {
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    backgroundColor: PALETTE.surface,
  },
  metricTopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  metricIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: PALETTE.primaryDim,
    alignItems: "center",
    justifyContent: "center",
  },
  metricHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flex: 1 },
  metricLabel: { fontSize: 10.5, fontWeight: 700 },
  metricValue: { fontSize: 13, fontWeight: 700 },
  metricBandRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  metricBandLabel: { fontSize: 8.5, color: PALETTE.inkMuted, fontWeight: 700 },
  metricWhat: { fontSize: 8.5, color: PALETTE.inkMuted, lineHeight: 1.4, marginTop: 6 },
  metricTip: { fontSize: 8.5, color: PALETTE.ink, lineHeight: 1.4, marginTop: 6, backgroundColor: PALETTE.mintDim, borderRadius: 8, padding: 7 },
  disclaimer: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: PALETTE.surface2,
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
  },
  disclaimerText: { fontSize: 8.5, color: PALETTE.inkMuted, lineHeight: 1.4, flex: 1 },
});

function ScoreRingPdf({ score, outOf100 }: { score: number; outOf100: string }) {
  const size = 112;
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const fraction = Math.max(0, Math.min(1, score / 100));

  return (
    <View style={styles.ringWrap}>
      <Svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <Defs>
          <LinearGradient id="score-ring-fill" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#e0a996" />
            <Stop offset="100%" stopColor="#c2a67a" />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={PALETTE.surface2} strokeWidth={stroke} fill="none" />
        {/* @react-pdf/renderer's Circle type doesn't expose strokeDashoffset
            (unlike the real ScoreRing.tsx's plain SVG) — a two-value
            dasharray (filled-length, then a gap covering the rest) draws
            the identical partial ring starting from the stroke's own
            origin point, which the -90deg rotation above already puts at
            the top. */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#score-ring-fill)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${length * fraction} ${length}`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={styles.scoreNum}>{Math.round(score)}</Text>
        <Text style={styles.scoreOutOf}>{outOf100}</Text>
      </View>
    </View>
  );
}

function GradientBarPdf({ value, band, gradientId }: { value: number; band: ScoreBand; gradientId: string }) {
  const [from, to] = BAND_BAR_GRADIENT[band];
  const fraction = Math.max(0, Math.min(1, value / 100));
  const fillWidth = METRIC_TRACK_W * fraction;

  return (
    <Svg width={METRIC_TRACK_W} height={5}>
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%" stopColor={from} />
          <Stop offset="100%" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={METRIC_TRACK_W} height={5} rx={2.5} fill={PALETTE.surface2} />
      {fillWidth > 0 && (
        <Rect x={0} y={0} width={fillWidth} height={5} rx={2.5} fill={`url(#${gradientId})`} />
      )}
    </Svg>
  );
}

function MetricIconPdf({ metric }: { metric: MetricKey }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d={METRIC_ICON_PATH[metric]}
        fill="none"
        stroke={PALETTE.primary}
        strokeWidth={metric === "pores" ? 3.2 : 1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ScanReportPdf({
  report,
  locale,
  imageBase64,
}: {
  report: ScanReport;
  locale: string;
  imageBase64?: string | null;
}) {
  const { diagnostic, email } = reportStrings(locale);
  const band = scoreBand(report.overall);
  const areas = report.flaggedZones ?? [];
  const ranked = [...METRIC_KEYS].sort((a, b) => report[b] - report[a]);
  const strongest = ranked[0];
  const weakest = ranked[ranked.length - 1];
  const showFocusPill = scoreBand(report[weakest]) !== "great";
  const scannedOn = interpolate(email.pdfScannedOn, {
    date: new Date(report.createdAt).toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
  });

  function areaText(zone: FlaggedZone, field: "title" | "body" | "tip"): string | null {
    const key = zone.key as keyof typeof diagnostic.areas | undefined;
    if (key && diagnostic.areas[key]) return diagnostic.areas[key][field];
    if (field === "title") return zone.zone;
    if (field === "body") return zone.description;
    return null;
  }

  return (
    <Document>
      {/* Page 1: overall verdict + face map + flagged areas. */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.stepLabel}>{email.pdfTitle} · {scannedOn}</Text>

        <View style={styles.verdictCard}>
          <ScoreRingPdf score={report.overall} outOf100={diagnostic.outOf100} />
          <View style={{ flex: 1 }}>
            <View style={styles.bandBadge}>
              <View style={[styles.bandDot, { backgroundColor: BAND_COLOR[band] }]} />
              <Text style={styles.bandLabel}>{diagnostic.bands[band]}</Text>
            </View>
            <Text style={styles.verdictTitle}>{diagnostic.verdict[band].title}</Text>
            <Text style={styles.verdictBody}>{diagnostic.verdict[band].body}</Text>
          </View>
        </View>

        <View style={styles.pillRow}>
          <Text style={styles.strongestPill}>
            • {interpolate(diagnostic.strongest, { metric: diagnostic[strongest] })}
          </Text>
          {showFocusPill && (
            <Text style={styles.focusPill}>
              • {interpolate(diagnostic.focusOn, { metric: diagnostic[weakest] })}
            </Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>{diagnostic.faceMapTitle}</Text>
        <View style={styles.faceMapCard}>
          <View style={styles.faceMapWrap}>
            {imageBase64 ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt prop (PDFs aren't the DOM)
              <Image src={imageBase64} style={styles.faceMapImage} />
            ) : (
              <View style={styles.faceMapPlaceholder} />
            )}
            {areas.map((zone, i) => {
              const pos = markerPosition(zone);
              return (
                <View
                  key={`${zone.key ?? zone.zone}-marker-${i}`}
                  style={[
                    styles.faceMarker,
                    {
                      borderColor: SEVERITY_COLOR[zone.severity],
                      left: pos.x * FACE_W - 10,
                      top: pos.y * FACE_H - 10,
                    },
                  ]}
                >
                  <Text style={styles.faceMarkerText}>{i + 1}</Text>
                </View>
              );
            })}
          </View>

          {areas.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 16, marginBottom: 8, width: "100%" }]}>
                {diagnostic.areasTitle}
              </Text>
              {areas.map((zone, i) => (
                <View key={`${zone.key ?? zone.zone}-${i}`} style={styles.areaRow}>
                  <View style={styles.areaHeaderRow}>
                    <View style={[styles.areaMarker, { backgroundColor: SEVERITY_COLOR[zone.severity] }]}>
                      <Text style={styles.areaMarkerText}>{i + 1}</Text>
                    </View>
                    <Text style={styles.areaTitle}>{areaText(zone, "title")}</Text>
                    <Text style={styles.areaSeverity}>{diagnostic.severity[zone.severity]}</Text>
                  </View>
                  <Text style={styles.areaBody}>{areaText(zone, "body")}</Text>
                  {areaText(zone, "tip") && (
                    <Text style={styles.areaTip}>
                      <Text style={{ fontWeight: 700 }}>{diagnostic.tipLabel}: </Text>
                      {areaText(zone, "tip")}
                    </Text>
                  )}
                </View>
              ))}
            </>
          ) : (
            <View style={styles.noAreas}>
              <Text style={{ fontWeight: 700, marginBottom: 2 }}>{diagnostic.noAreasTitle}</Text>
              <Text style={{ color: PALETTE.inkMuted }}>{diagnostic.noAreasBody}</Text>
            </View>
          )}
        </View>
      </Page>

      {/* Page 2: scores legend + per-metric cards + disclaimer — kept on its
          own page so page 1's verdict + face map + areas never get split
          awkwardly by react-pdf's automatic overflow pagination. */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.stepLabel}>{email.pdfTitle} · {scannedOn}</Text>

        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>{diagnostic.scoresTitle}</Text>
          <Text style={styles.scaleHint}>{diagnostic.scaleHint}</Text>
        </View>
        <View style={styles.bandLegendRow}>
          {(["great", "good", "fair", "needsCare"] as const).map((b) => (
            <View key={b} style={styles.bandLegendItem}>
              <View style={[styles.bandDot, { backgroundColor: BAND_COLOR[b] }]} />
              <Text style={styles.bandLegendLabel}>{diagnostic.bands[b]}</Text>
            </View>
          ))}
        </View>

        {METRIC_KEYS.map((metric) => {
          const value = report[metric];
          const metricBand = scoreBand(value);
          const needsTip = metricBand === "fair" || metricBand === "needsCare";
          return (
            <View key={metric} style={styles.metricCard}>
              <View style={styles.metricTopRow}>
                <View style={styles.metricIconBox}>
                  <MetricIconPdf metric={metric} />
                </View>
                <View style={styles.metricHeaderRow}>
                  <View>
                    <Text style={styles.metricLabel}>{diagnostic[metric]}</Text>
                    <View style={styles.metricBandRow}>
                      <View style={[styles.bandDot, { backgroundColor: BAND_COLOR[metricBand] }]} />
                      <Text style={styles.metricBandLabel}>{diagnostic.bands[metricBand]}</Text>
                    </View>
                  </View>
                  <Text style={styles.metricValue}>{Math.round(value)}</Text>
                </View>
              </View>
              <View style={{ marginTop: 8 }}>
                <GradientBarPdf value={value} band={metricBand} gradientId={`metric-bar-${metric}`} />
              </View>
              <Text style={styles.metricWhat}>{diagnostic.metrics[metric].what}</Text>
              {needsTip && (
                <Text style={styles.metricTip}>
                  <Text style={{ fontWeight: 700 }}>{diagnostic.tipLabel}: </Text>
                  {diagnostic.metrics[metric].tip}
                </Text>
              )}
            </View>
          );
        })}

        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>{diagnostic.disclaimer}</Text>
        </View>
      </Page>
    </Document>
  );
}
