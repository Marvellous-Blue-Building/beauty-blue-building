import type { SkinMeasurement } from "@/types/scan";

export const measurementCopy = (locale: string) => locale === "id" ? {
  title: "Skor tampilan kulit", badge: "Estimasi visual", intro: "Skor dari detail yang terlihat di foto depan. Skor lebih tinggi berarti kontras detail lebih rendah, bukan kulit lebih sehat.",
  unavailable: "Belum terukur", measured: "Terukur", coverage: "Area sampel yang dapat dibaca", pixels: "piksel", source: "Foto depan", unit: "unit kontras", details: "Cara membaca angka ini", interpretation: "Angka kontras mentah pada rincian berlawanan arah dengan skor: angka mentah lebih tinggi berarti kontras detail lebih kuat, bukan otomatis kulit lebih buruk. Belum ada batas normal atau tidak normal. Penghalusan kamera dapat menyembunyikan detail.", noScores: "Hidrasi dan elastisitas tidak diukur oleh pemindaian ini. Skala visual ini masih bersifat sementara dan belum tervalidasi. Pencahayaan dan penghalusan kamera dapat meningkatkan skor.", legacy: "Laporan ini memakai skor perkiraan versi lama. Pindai ulang untuk melihat pengukuran visual beserta kualitas sampelnya.",
  labels: { cheek_roughness: "Kehalusan permukaan", fine_lines: "Kelembutan garis", tone_spots: "Kerataan warna", cheek_texture: "Kehalusan tekstur", nose_pores: "Tampilan pori" } as Record<string, string>,
  reasons: { low_resolution: "Dekatkan wajah; detail terlalu kecil pada foto asli.", missing_region: "Area yang diperlukan tidak terlihat. Singkirkan penghalang lalu pindai ulang.", insufficient_skin: "Terlalu sedikit kulit yang dapat dibaca. Kurangi pantulan dan periksa posisi wajah.", overexposed: "Cahaya terlalu terang menghilangkan detail. Gunakan cahaya lembut.", invalid_signal: "Detail tidak dapat diukur dengan andal. Ambil foto baru." } as Record<string, string>,
} : {
  title: "Skin appearance scores", badge: "Visual estimates", intro: "Scores from visible detail in your front photo. Higher scores mean less detail contrast, not healthier skin.",
  unavailable: "Not measured", measured: "Measured", coverage: "Usable sample area", pixels: "pixels", source: "Front photo", unit: "contrast units", details: "How to read these numbers", interpretation: "The raw contrast readings in the details run in the opposite direction to the scores: higher raw values mean stronger detail contrast, not necessarily worse skin. No normal or abnormal cutoffs have been established. Camera smoothing can hide detail.", noScores: "Hydration and elasticity are not measured by this scan. This visual scale is provisional and has not been validated. Lighting and camera smoothing can raise scores.", legacy: "This report uses an older estimated score. Scan again for visual measurements with sample-quality information.",
  labels: { cheek_roughness: "Surface smoothness", fine_lines: "Line softness", tone_spots: "Tone evenness", cheek_texture: "Texture smoothness", nose_pores: "Pore appearance" } as Record<string, string>,
  reasons: { low_resolution: "Move closer; detail is too small in the original photo.", missing_region: "A required area is not visible. Remove obstructions and scan again.", insufficient_skin: "Too little usable skin detail. Reduce glare and check face position.", overexposed: "Bright light has washed out detail. Use softer lighting.", invalid_signal: "Detail could not be measured reliably. Take a new photo." } as Record<string, string>,
};

export function isMeasured(reading: SkinMeasurement): reading is SkinMeasurement & { value: number } {
  return reading.status === "measured" && typeof reading.value === "number" && Number.isFinite(reading.value) && reading.value >= 0;
}


/** Display-only, provisional legacy contrast scale. Never a health metric or
 * recommendation input. Keep the standalone widget equivalent covered by tests. */
export function visualScore(reading: SkinMeasurement): number | null {
  const anchors: Record<string, [number, number]> = {
    cheek_roughness: [1.2, 3.5], fine_lines: [1.8, 5], tone_spots: [4, 12],
    cheek_texture: [1.8, 5], nose_pores: [2.5, 6.5],
  };
  const range = anchors[reading.key];
  if (!range || !isMeasured(reading) || reading.unit !== "log_contrast" || reading.source !== "front" || reading.reason != null ||
      !Number.isFinite(reading.samplePixels) || reading.samplePixels < 120 ||
      !Number.isFinite(reading.coverage) || reading.coverage < 0.5 || reading.coverage > 1) return null;
  return Math.round(Math.max(5, Math.min(99, 95 - 50 * (reading.value - range[0]) / (range[1] - range[0]))));
}
