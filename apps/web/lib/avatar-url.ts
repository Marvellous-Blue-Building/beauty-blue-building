/**
 * Avatar files are overwritten at the same path on every upload
 * (/assets/avatars/<userId>.<ext>), so the browser's HTTP cache will keep
 * serving the old cached bytes for that exact URL unless the URL itself
 * changes. Appending a version query param derived from a real timestamp
 * forces a fresh fetch whenever the underlying file actually changed,
 * without storing anything other than the clean path in the DB.
 */
export function withCacheBust(path: string | null, version: number): string | null {
  return path ? `${path}?v=${version}` : null;
}
