/**
 * Format a number as Indonesian Rupiah
 * @example formatCurrency(1500000) → "Rp 1,5jt"
 */
export function formatCurrency(amount: number, compact = true): string {
  if (compact) {
    if (amount >= 1_000_000_000) {
      return `Rp ${(amount / 1_000_000_000).toFixed(1)}M`
    }
    if (amount >= 1_000_000) {
      return `Rp ${(amount / 1_000_000).toFixed(0)}jt`
    }
    if (amount >= 1_000) {
      return `Rp ${(amount / 1_000).toFixed(0)}rb`
    }
  }
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Format an investment range
 * @example formatCurrencyRange(50000000, 150000000) → "Rp 50jt – Rp 150jt"
 */
export function formatCurrencyRange(
  min: number,
  max?: number | null,
): string {
  if (!max || max === min) return formatCurrency(min)
  return `${formatCurrency(min)} – ${formatCurrency(max)}`
}

/**
 * Format salary range for job listings
 */
export function formatSalaryRange(
  min?: number | null,
  max?: number | null,
): string {
  if (!min && !max) return "Negotiable"
  if (!max) return `${formatCurrency(min!)}+`
  if (!min) return `s/d ${formatCurrency(max)}`
  return formatCurrencyRange(min, max)
}
