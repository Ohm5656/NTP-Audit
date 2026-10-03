import type { Metadata } from "next";
import "@fontsource/ibm-plex-sans-thai/400.css";
import "@fontsource/ibm-plex-sans-thai/500.css";
import "@fontsource/ibm-plex-sans-thai/600.css";
import "@fontsource/ibm-plex-sans-thai/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "NTP Audit | ระบบรายได้พนักงาน",
  description: "ระบบข้อมูลเงินเดือน รายงานรายปี และการนำเข้า Excel",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body>{children}</body></html>;
}
