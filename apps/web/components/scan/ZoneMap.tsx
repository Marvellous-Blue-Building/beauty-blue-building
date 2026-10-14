import type { FlaggedZone, FlaggedZoneSeverity } from "@/types/scan";
import { cn } from "@/lib/cn";

// Where each named clinical zone is drawn on the face silhouette. Zone keys
// are matched by keyword so the map keeps working if the engine's wording
// shifts slightly.
const ZONE_POSITIONS: { match: string[]; top: string; left: string }[] = [
  { match: ["forehead", "sebum"], top: "15%", left: "48%" },
  { match: ["under-eye", "under eye", "eye"], top: "38%", left: "70%" },
  { match: ["cheek", "texture", "redness", "erythema"], top: "52%", left: "27%" },
  { match: ["nose", "pore", "t-zone"], top: "54%", left: "50%" },
  { match: ["chin", "mandible", "barrier"], top: "76%", left: "50%" },
];

const SEVERITY_CLASS: Record<FlaggedZoneSeverity, string> = {
  high: "bg-warn shadow-[0_0_0_1px_var(--color-warn)]",
  medium: "bg-secondary shadow-[0_0_0_1px_var(--color-secondary)]",
  low: "bg-mint shadow-[0_0_0_1px_var(--color-mint)]",
};

function positionFor(zone: string) {
  const lower = zone.toLowerCase();
  const found = ZONE_POSITIONS.find((entry) =>
    entry.match.some((keyword) => lower.includes(keyword))
  );
  return found ?? ZONE_POSITIONS[0];
}

export function ZoneMap({
  zones = [],
  imageSrc,
}: {
  zones?: FlaggedZone[];
  /** The exact photo the metrics were computed from — shown as the face when available. */
  imageSrc?: string | null;
}) {
  return (
    <div className="relative mx-auto mb-[18px] aspect-[11/16] w-[150px] overflow-hidden rounded-[50%/56%] border border-border">
      {imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt=""
          className="h-full w-full object-cover object-center"
        />
      ) : (
        <div
          className="h-full w-full"
          style={{
            background:
              "linear-gradient(160deg, var(--color-surface), var(--color-surface-2))",
          }}
        />
      )}
      {zones.map((zone, i) => {
        const pos = positionFor(zone.zone);
        return (
          <span
            key={`${zone.zone}-${i}`}
            className={cn(
              "absolute h-[13px] w-[13px] rounded-full border-2 border-app-bg",
              SEVERITY_CLASS[zone.severity] ?? SEVERITY_CLASS.low
            )}
            style={{ top: pos.top, left: pos.left }}
            title={`${zone.zone}: ${zone.description}`}
          />
        );
      })}
    </div>
  );
}
