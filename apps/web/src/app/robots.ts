import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://example.com"
  
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard/", "/api/", "/auth/callback", "/login", "/register", "/forgot-password"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
