/**
 * The real catalog's `image_url` column is a Cloudflare Image Resizing URL
 * wrapping the real origin, e.g.:
 *   https://www.sociolla.com/cdn-cgi/image/w=200,format=auto,dpr=1.45/https://images.soco.id/<id>.jpg
 *
 * That `cdn-cgi/image` resize proxy is dead (verified returning 404 across
 * a sample of the dataset), but the embedded origin URL it wraps is still
 * live (verified 200 across images.soco.id, s3-ap-southeast-1.amazonaws.com,
 * and soc-uat-uploads.s3.amazonaws.com — the only 3 hosts present in the
 * full 24,941-row dataset). This extracts that real origin URL.
 */
export function extractImageUrl(raw: string | null): string | null {
  if (!raw) return null;
  const secondHttpsIndex = raw.indexOf("https://", 8);
  return secondHttpsIndex !== -1 ? raw.slice(secondHttpsIndex) : raw;
}
