import "@evoly/ui/fonts.css";
import "./globals.css";
import { palette } from "@evoly/ui";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import { isAppHost } from "@/lib/pwa";

const BASE: Metadata = {
  title: { default: "Evoly", template: "%s — Evoly" },
  description: "Ton prochain souvenir t'attend.",
  robots: { index: false, follow: false },
};

/** Sur app.evoly.me seulement : application installable (manifeste, réglages iPhone). Jamais sur les billetteries. */
export async function generateMetadata(): Promise<Metadata> {
  if (!(await isAppHost())) return BASE;
  return { ...BASE, manifest: "/app.webmanifest", appleWebApp: { capable: true, title: "Evoly", statusBarStyle: "black" } };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: palette.creme },
    { media: "(prefers-color-scheme: dark)", color: palette.charbon },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, messages, appHost] = await Promise.all([getLocale(), getMessages(), isAppHost()]);
  return (
    <html lang={locale}>
      <body className="min-h-dvh">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
        {appHost && <PwaRegister />}
      </body>
    </html>
  );
}
