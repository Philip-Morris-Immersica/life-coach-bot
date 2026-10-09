import "./globals.css";
import type { Metadata, Viewport } from "next";
import { readSession } from "@/lib/auth";
import AppNav from "@/components/app-nav";
import SwRegister from "@/components/sw-register";

export const metadata: Metadata = {
  title: { default: "Life Coach", template: "%s · Life Coach" },
  description: "Личен AI коуч за навици, вярвания и идентичност.",
  applicationName: "Life Coach",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Life Coach", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/pwa-icon/32", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/pwa-icon/180", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f3ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1513" },
  ],
};

// Прилага запазената тема преди първото рисуване (без премигване).
const themeScript = `try{var t=localStorage.getItem('lc-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await readSession();
  return (
    <html lang="bg" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="max-w-5xl mx-auto px-4">
          <AppNav loggedIn={Boolean(session)} isAdmin={Boolean(session?.isAdmin)} />
          <main className="py-6 app-main">{children}</main>
        </div>
        <SwRegister />
      </body>
    </html>
  );
}
