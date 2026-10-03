import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-sans-thai/400.css";
import "@fontsource/ibm-plex-sans-thai/500.css";
import "@fontsource/ibm-plex-sans-thai/600.css";
import "@fontsource/ibm-plex-sans-thai/700.css";
import "./globals.css";
import { PwaRegistration } from "@/components/pwa-registration";

export const metadata: Metadata = {
  title: "NTP Audit | ระบบรายได้พนักงาน",
  description: "ระบบข้อมูลเงินเดือน รายงานรายปี และการนำเข้า Excel",
  applicationName: "NTP Audit",
  icons: { icon: "/logo.png", apple: "/logo.png" },
};

export const viewport: Viewport = { themeColor: "#176D52" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body><PwaRegistration />{children}</body></html>;
}
