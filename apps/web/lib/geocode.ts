/**
 * Reverse geocodes coordinates into a human-readable full address, via
 * OpenStreetMap's free Nominatim API (no API key required). Used only by
 * app/api/profile/location/route.ts to populate the "Get Realtime
 * Location" toggle's displayed address on the Profile screen.
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`;
    const response = await fetch(url, {
      headers: {
        // Nominatim's usage policy requires an identifying User-Agent.
        "User-Agent": "BeautyBlueBuildingApp/1.0 (skin-advisor realtime location feature)",
      },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { display_name?: string };
    return typeof data.display_name === "string" ? data.display_name : null;
  } catch (error) {
    console.error("Reverse geocoding failed:", error);
    return null;
  }
}
