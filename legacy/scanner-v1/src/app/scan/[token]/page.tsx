import { db } from "@evoly/db";
import { notFound } from "next/navigation";
import { ScannerApp } from "@/components/ScannerApp";

export default async function ScanPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const scannerLink = await db.scannerLink.findUnique({
    where: { token },
    include: {
      event: {
        select: { id: true, title: true, startsAt: true },
      },
    },
  });

  if (!scannerLink || scannerLink.revokedAt || scannerLink.expiresAt < new Date()) {
    notFound();
  }

  return (
    <ScannerApp
      token={token}
      label={scannerLink.label}
      event={{
        id: scannerLink.event.id,
        title: scannerLink.event.title,
        startsAt: scannerLink.event.startsAt.toISOString(),
      }}
    />
  );
}
