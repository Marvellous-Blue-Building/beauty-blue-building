/** Look previews belong to the web app, not the scan service or retailer.
 * Normalize old absolute URLs too: proxy origins may contain internal hosts. */
export function lookImagePath(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const url = new URL(value, "https://look-assets.invalid");
    if (!/^https?:$/.test(url.protocol)) return undefined;
    return /^\/beauty\/looks\/[a-z0-9_-]+\.jpg$/.test(url.pathname) ? url.pathname : undefined;
  } catch {
    return undefined;
  }
}
