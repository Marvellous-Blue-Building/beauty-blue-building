import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { isMeasured, measurementCopy, visualScore } from "@/lib/scan/measurement-copy";
import type { ScanReport } from "@/types/scan";

const styles = StyleSheet.create({
  page: { padding: 30, backgroundColor: "#fffaf7", color: "#523f38", fontFamily: "Helvetica", fontSize: 10 },
  title: { fontSize: 24, marginBottom: 10 },
  text: { lineHeight: 1.3, color: "#79676c" },
  card: { marginTop: 8, padding: 10, backgroundColor: "#f9edf1", borderRadius: 12 },
  label: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 5 },
  value: { fontSize: 18, marginBottom: 3 },
  note: { marginTop: 12, lineHeight: 1.3 },
});

/** Uses the same measured/unavailable contract and copy as the live report.
 * Archived unvalidated health scores are never reissued as validated results. */
export function ScanReportPdf({ report, locale, imageBase64 }: {
  report: ScanReport;
  locale: string;
  imageBase64?: string | null;
}) {
  const copy = measurementCopy(locale);
  return <Document><Page size="A4" style={styles.page}>
    <Text style={styles.title}>{copy.title}</Text>
    <Text style={styles.text}>{new Date(report.createdAt).toLocaleDateString(locale === "id" ? "id-ID" : "en-US")} · {report.scanId}</Text>
    <Text style={[styles.text, { marginTop: 10 }]}>{copy.intro}</Text>
    {imageBase64 && (
      // eslint-disable-next-line jsx-a11y/alt-text -- PDF image primitive has no alt prop
      <Image src={imageBase64} style={{ width: 80, height: 100, objectFit: "cover", marginTop: 12, borderRadius: 12 }} />
    )}
    {(report.measurements ?? []).map(reading => <View key={reading.key} style={styles.card} wrap={false}>
      <Text style={styles.label}>{copy.labels[reading.key] ?? reading.key}</Text>
      <Text style={styles.value}>{visualScore(reading) !== null ? `${visualScore(reading)} / 100` : copy.unavailable}</Text>
      {visualScore(reading) !== null && <View style={{ height: 5, borderRadius: 3, backgroundColor: "#ecdde2", marginBottom: 5 }}><View style={{ height: 5, borderRadius: 3, backgroundColor: "#d26287", width: `${visualScore(reading)}%` }} /></View>}
      {isMeasured(reading) && <Text style={styles.text}>{reading.value.toFixed(2)} {copy.unit}</Text>}
      <Text style={styles.text}>{copy.source} · {reading.samplePixels} {copy.pixels}</Text>
      <Text style={styles.text}>{isMeasured(reading) ? `${copy.coverage}: ${Math.round(reading.coverage * 100)}%` : copy.reasons[reading.reason ?? ""] ?? copy.reasons.invalid_signal}</Text>
    </View>)}
    {!report.measurements?.length && <Text style={styles.note}>{copy.legacy}</Text>}
    <Text style={styles.note}>{copy.noScores}</Text>
  </Page></Document>;
}
