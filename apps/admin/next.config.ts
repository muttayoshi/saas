import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Enable React strict mode for better dev experience
  reactStrictMode: true,

  // Images from Supabase storage
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "fhqnbfjvvpzcohjkvfcc.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  // Transpile workspace packages and map packages
  transpilePackages: ["@app/ui", "@app/types", "@app/utils"],
}

export default nextConfig
