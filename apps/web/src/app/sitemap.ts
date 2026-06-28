import type { MetadataRoute } from "next"
import { createClient } from "@/lib/supabase/server"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://example.com"
  const supabase = await createClient()

  // Static routes
  const staticRoutes = ["", "/franchise", "/property", "/jobs", "/about", "/contact"].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: route === "" ? 1 : 0.8,
  }))

  // Fetch dynamic routes
  const [franchises, properties, jobs] = await Promise.all([
    supabase.from("franchises").select("slug, updated_at").eq("status", "active"),
    supabase.from("properties").select("slug, updated_at").eq("status", "available"),
    supabase.from("jobs").select("slug, updated_at").eq("status", "open"),
  ])

  const franchiseRoutes = (franchises.data || []).map((item) => ({
    url: `${baseUrl}/franchise/${item.slug}`,
    lastModified: new Date(item.updated_at || Date.now()),
    changeFrequency: "weekly" as const,
    priority: 0.9,
  }))

  const propertyRoutes = (properties.data || []).map((item) => ({
    url: `${baseUrl}/property/${item.slug}`,
    lastModified: new Date(item.updated_at || Date.now()),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }))

  const jobRoutes = (jobs.data || []).map((item) => ({
    url: `${baseUrl}/jobs/${item.slug}`,
    lastModified: new Date(item.updated_at || Date.now()),
    changeFrequency: "daily" as const,
    priority: 0.7,
  }))

  return [...staticRoutes, ...franchiseRoutes, ...propertyRoutes, ...jobRoutes]
}
