import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { palette } from "@evoly/ui";
import { notFound } from "next/navigation";
import { ScannerApp } from "@/components/scanner/ScannerApp";
import { resolveScannerLink } from "@/server/scanner";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Scanner", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const viewport: Viewport = { themeColor: palette.charbon, width: "device-width", initialScale: 1, viewportFit: "cover" };

/** Scanner d'un lien bénévole : scanner.evoly.me/s/[jeton] (section 9.17). */
export default async function ScannerPage({ params }: { params: Promise<{ token: string }> }) {
  if ((await headers()).get("x-evoly-scanner") !== "1") notFound();
  const { token } = await params;
  const resolved = await resolveScannerLink(token);
  if (!resolved) return <ScannerApp token={token} gone="UNKNOWN_LINK" />;
  if (resolved.state !== "OK") return <ScannerApp token={token} gone={resolved.state} />;
  return <ScannerApp token={token} />;
}
