import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "NTP Audit — ระบบรายได้พนักงาน",
    short_name: "NTP Audit",
    description: "ข้อมูลเงินเดือนและรายงานรายปีของบริษัท",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F5F8F6",
    theme_color: "#176D52",
    lang: "th",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
