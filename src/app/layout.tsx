import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "금은마켓 BIZ",
  description: "금은마켓 사업자(매장주)용 매장 관리 웹앱",
  applicationName: "금은마켓 BIZ",
  robots: "noindex, nofollow",
};

export const viewport: Viewport = {
  themeColor: "#ea580c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="font-sans antialiased bg-surface text-ink">{children}</body>
    </html>
  );
}
