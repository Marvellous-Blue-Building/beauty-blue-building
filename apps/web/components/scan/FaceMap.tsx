import type { CropRect } from "@/lib/image-crop";
import type { FlaggedZone, FlaggedZoneSeverity } from "@/types/scan";
import { cn } from "@/lib/cn";

// Approximate spot per area on the face photo, used when a report has no
// measured position (older reports, or no photo). Matched by key or, for
// older reports, by keyword in the zone name.
const FALLBACK_POSITIONS: { match: string[]; x: number; y: number }[] = [
  { match: ["forehead", "sebum", "shine"], x: 0.5, y: 0.17 },
  { match: ["under_eye", "under-eye", "under eye", "eye"], x: 0.3, y: 0.42 },
  { match: ["redness", "erythema"], x: 0.72, y: 0.55 },
  { match: ["cheek", "texture"], x: 0.28, y: 0.55 },
  { match: ["nose", "pore", "t-zone"], x: 0.5, y: 0.52 },
  { match: ["chin", "mandible", "barrier"], x: 0.5, y: 0.8 },
];

export const SEVERITY_MARKER: Record<FlaggedZoneSeverity, string> = {
  high: "bg-warn",
  medium: "bg-primary",
  low: "bg-mint",
};

// On the photo, markers are white with a severity-colored ring so even the
// light "mild" color stands out against skin.
const SEVERITY_RING: Record<FlaggedZoneSeverity, string> = {
  high: "border-warn",
  medium: "border-primary",
  low: "border-mint",
};

function markerPosition(zone: FlaggedZone, crop: CropRect | null, hasPhoto: boolean) {
  if (hasPhoto && crop && zone.x != null && zone.y != null) {
    const x = (zone.x - crop.x) / crop.w;
    const y = (zone.y - crop.y) / crop.h;
    if (x > 0 && x < 1 && y > 0 && y < 1) return { x, y };
  }
  const name = `${zone.key ?? ""} ${zone.zone}`.toLowerCase();
  const found = FALLBACK_POSITIONS.find((entry) => entry.match.some((k) => name.includes(k)));
  return found ?? FALLBACK_POSITIONS[0];
}

/** The scanned face with a numbered marker on each flagged area. Markers and
 * the matching list share `active` so tapping either highlights both. */
export function FaceMap({
  zones,
  imageSrc,
  imageCrop,
  active,
  onSelect,
  labelFor,
}: {
  zones: FlaggedZone[];
  /** The exact photo the metrics were computed from, cropped to the head. */
  imageSrc?: string | null;
  imageCrop?: CropRect | null;
  active: number | null;
  onSelect: (index: number) => void;
  labelFor: (zone: FlaggedZone) => string;
}) {
  return (
    <div className="relative mx-auto aspect-[11/16] w-[176px] overflow-hidden rounded-[50%/56%] border-[3px] border-surface shadow-[0_10px_30px_-12px_rgba(82,63,56,0.45)]">
      {imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageSrc} alt="" className="h-full w-full object-cover object-center" />
      ) : (
        <div className="h-full w-full bg-[linear-gradient(160deg,var(--color-surface),var(--color-surface-2))]" />
      )}
      {zones.map((zone, i) => {
        const pos = markerPosition(zone, imageCrop ?? null, !!imageSrc);
        const isActive = active === i;
        return (
          <button
            key={`${zone.key ?? zone.zone}-${i}`}
            type="button"
            onClick={() => onSelect(i)}
            aria-label={`${i + 1}. ${labelFor(zone)}`}
            aria-pressed={isActive}
            className={cn(
              "absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] bg-surface font-mono text-[11px] font-bold text-canvas-ink shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-transform duration-200",
              SEVERITY_RING[zone.severity] ?? SEVERITY_RING.low,
              isActive && "scale-125 animate-[marker-pulse_1.4s_ease-out_infinite]"
            )}
            style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}
