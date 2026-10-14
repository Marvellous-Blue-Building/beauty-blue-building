/** "sun-care" -> "Sun Care" — for displaying raw DB category strings as chip labels. */
export function titleCaseFromSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}
