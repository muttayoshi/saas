/**
 * Get initials from a full name (for avatar fallback)
 * @example getInitials("Budi Santoso") → "BS"
 */
export function getInitials(name: string, maxChars = 2): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxChars)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")
}

/**
 * Truncate text to a max length with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + "..."
}

/**
 * Format a number with thousand separators
 * @example formatNumber(1234567) → "1.234.567"
 */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n)
}

/**
 * Pluralize a word based on count (simple English)
 */
export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? `${count} ${singular}` : `${count} ${plural}`
}
