import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CropRect } from "@/lib/image-crop";
import type { BeautyScanReport, BeautyPoseKey } from "@/types/beauty-scan";
import type { ScanReport } from "@/types/scan";

interface ScanState {
  result: ScanReport | null;
  /** The same scan's colour season, face shape and skin type (/api/scan-beauty).
   * Null for a scan taken before the beauty scan, or from an older client. */
  beauty: BeautyScanReport | null;
  /** Small previews of the scan's three poses, as the user saw them. In
   * memory only, like the photo. */
  poseThumbs: Partial<Record<BeautyPoseKey, string>>;
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
  setResult: (result: ScanReport, beauty?: BeautyScanReport | null) => void;
  setPoseThumbs: (thumbs: Partial<Record<BeautyPoseKey, string>>) => void;
  setImage: (imageDataUrl: string | null, imageCrop?: CropRect | null) => void;
  setOrigin: (origin: "scan" | "checkin") => void;
}

export const useScanStore = create<ScanState>()(
  persist(
    (set) => ({
      result: null,
      beauty: null,
      poseThumbs: {},
      imageDataUrl: null,
      imageCrop: null,
      origin: "scan",
      setResult: (result: ScanReport, beauty: BeautyScanReport | null = null) => set({ result, beauty }),
      setPoseThumbs: (poseThumbs) => set({ poseThumbs }),
      setImage: (imageDataUrl: string | null, imageCrop: CropRect | null = null) =>
        set({ imageDataUrl, imageCrop }),
      setOrigin: (origin: "scan" | "checkin") => set({ origin }),
    }),
    {
      name: "beauty-advisor-scan-result",
      storage: createJSONStorage(() => sessionStorage),
      // Only `result` and `beauty` survive a reload; the photos and origin
      // stay in memory.
      partialize: (state) => ({ result: state.result, beauty: state.beauty }),
    }
  )
);
