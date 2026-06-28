import type { Locale } from "@app/types"

type TranslationValue = string | Record<string, unknown>

/**
 * Simple bilingual translation helper
 * Usage: t({ id: "Cari Franchise", en: "Find Franchise" }, locale)
 */
export function t(
  translations: { id: string; en: string },
  locale: Locale = "id",
): string {
  return translations[locale]
}

/**
 * Get locale from Accept-Language header or cookie
 */
export function getLocaleFromRequest(
  acceptLanguage?: string,
  cookieLocale?: string,
): Locale {
  if (cookieLocale === "id" || cookieLocale === "en") return cookieLocale
  if (acceptLanguage?.startsWith("id")) return "id"
  return "id" // default to Indonesian
}

// Common UI translations
export const uiTranslations = {
  nav: {
    franchise: { id: "Franchise", en: "Franchise" },
    property: { id: "Properti", en: "Property" },
    jobs: { id: "Lowongan", en: "Jobs" },
    login: { id: "Masuk", en: "Login" },
    register: { id: "Daftar", en: "Register" },
    dashboard: { id: "Dashboard", en: "Dashboard" },
    logout: { id: "Keluar", en: "Logout" },
  },
  status: {
    new: { id: "Baru", en: "New" },
    contacted: { id: "Dihubungi", en: "Contacted" },
    qualified: { id: "Terverifikasi", en: "Qualified" },
    closed: { id: "Ditutup", en: "Closed" },
    published: { id: "Aktif", en: "Published" },
    draft: { id: "Draft", en: "Draft" },
    archived: { id: "Arsip", en: "Archived" },
    available: { id: "Tersedia", en: "Available" },
    rented: { id: "Disewa", en: "Rented" },
  },
  actions: {
    save: { id: "Simpan", en: "Save" },
    cancel: { id: "Batal", en: "Cancel" },
    delete: { id: "Hapus", en: "Delete" },
    edit: { id: "Edit", en: "Edit" },
    submit: { id: "Kirim", en: "Submit" },
    search: { id: "Cari", en: "Search" },
    filter: { id: "Filter", en: "Filter" },
    loadMore: { id: "Muat Lebih Banyak", en: "Load More" },
    apply: { id: "Lamar", en: "Apply" },
    contact: { id: "Hubungi", en: "Contact" },
    interested: { id: "Saya Tertarik", en: "I'm Interested" },
  },
  meta: {
    investment: { id: "Modal", en: "Investment" },
    roi: { id: "ROI", en: "ROI" },
    bep: { id: "BEP", en: "BEP" },
    outlets: { id: "Outlet", en: "Outlets" },
    rent: { id: "Sewa/Bulan", en: "Rent/Month" },
    salary: { id: "Gaji", en: "Salary" },
    location: { id: "Lokasi", en: "Location" },
    category: { id: "Kategori", en: "Category" },
  },
} as const satisfies Record<string, Record<string, { id: string; en: string }>>
