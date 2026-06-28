import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt = "SaaS"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(to bottom right, #0c0f1e, #1a1f3c)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
          padding: "80px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "120px",
            height: "120px",
            borderRadius: "30px",
            background: "#d4af37", // gold
            color: "#0c0f1e",
            fontSize: "64px",
            fontWeight: "bold",
            marginBottom: "40px",
          }}
        >
          M
        </div>
        <div
          style={{
            fontSize: "72px",
            fontWeight: "bold",
            color: "#ffffff",
            marginBottom: "20px",
            textAlign: "center",
          }}
        >
          SaaS
        </div>
        <div
          style={{
            fontSize: "36px",
            color: "#9ca3af", // muted foreground
            textAlign: "center",
            maxWidth: "900px",
          }}
        >
          Platform Ekosistem Franchise #1 di Indonesia
        </div>
      </div>
    ),
    { ...size }
  )
}
