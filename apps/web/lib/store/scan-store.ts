import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CropRect } from "@/lib/image-crop";
import type { ScanReport } from "@/types/scan";

interface ScanState {
  result: ScanReport | null;
  /**
   * The exact frame the report's metrics were computed from, kept in memory
   * only (never persisted — it's a large base64 data URL and sessionStorage's
   * quota is small). The weekly check-in "Submit scan" uses it to store the
   * photo with the scan_results row.
   */
  imageDataUrl: string | null;
  /** Where `imageDataUrl` sits in the analyzed frame, to map the report's
   * zone positions onto it. In memory only, like the photo. */
  imageCrop: CropRect | null;
  /**
   * Where the current scan was launched from. "checkin" (the weekly
   * "Recheck Your Skin" flow) turns the report's primary CTA into an explicit
   * "Submit scan" that persists the photo; the default baseline scan keeps the
   * "Continue to Profile Setup" → quiz journey.
   */
  origin: "scan" | "checkin";
  setResult: (result: ScanReport) => void;
  setImage: (imageDataUrl: string | null, imageCrop?: CropRect | null) => void;
  setOrigin: (origin: "scan" | "checkin") => void;
}

export const useScanStore = create<ScanState>()(
  persist(
    (set) => ({
      result: null,
      imageDataUrl: null,
      imageCrop: null,
      origin: "scan",
      setResult: (result: ScanReport) => set({ result }),
      setImage: (imageDataUrl: string | null, imageCrop: CropRect | null = null) =>
        set({ imageDataUrl, imageCrop }),
      setOrigin: (origin: "scan" | "checkin") => set({ origin }),
    }),
    {
      name: "beauty-advisor-scan-result",
      storage: createJSONStorage(() => sessionStorage),
      // Only `result` survives a reload; the captured photo and origin stay
      // in memory.
      partialize: (state) => ({ result: state.result }),
    }
  )
);
