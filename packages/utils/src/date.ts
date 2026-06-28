import { format, formatDistanceToNow, parseISO } from "date-fns"
import { id as idLocale, enUS } from "date-fns/locale"
import type { Locale } from "@app/types"

/**
 * Format a date string in Indonesian or English
 * @example formatDate("2024-01-15", "id") → "15 Januari 2024"
 */
export function formatDate(
  date: string | Date,
  locale: Locale = "id",
  pattern = "d MMMM yyyy",
): string {
  const dateObj = typeof date === "string" ? parseISO(date) : date
  return format(dateObj, pattern, {
    locale: locale === "id" ? idLocale : enUS,
  })
}

/**
 * Format a date as relative time
 * @example formatRelativeDate("2024-01-15") → "3 hari yang lalu"
 */
export function formatRelativeDate(
  date: string | Date,
  locale: Locale = "id",
): string {
  const dateObj = typeof date === "string" ? parseISO(date) : date
  return formatDistanceToNow(dateObj, {
    addSuffix: true,
    locale: locale === "id" ? idLocale : enUS,
  })
}

/**
 * Format a date short form
 * @example formatDateShort("2024-01-15") → "15 Jan 2024"
 */
export function formatDateShort(
  date: string | Date,
  locale: Locale = "id",
): string {
  return formatDate(date, locale, "d MMM yyyy")
}
