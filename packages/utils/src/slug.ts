/**
 * Convert a string to a URL-safe slug
 * @example slugify("Ayam Geprek Bensu") → "ayam-geprek-bensu"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[àáâãäå]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u")
    .replace(/[ñ]/g, "n")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

/**
 * Generate a unique slug by appending a suffix if needed
 * @example uniqueSlug("ayam-geprek", ["ayam-geprek"]) → "ayam-geprek-2"
 */
export function uniqueSlug(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base
  let counter = 2
  while (existing.includes(`${base}-${counter}`)) counter++
  return `${base}-${counter}`
}
