import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { reservationByToken, reservationSeats } from "@/server/checkout";
import { getPublicOrganization } from "@/server/publicEvents";
import { PayAtVenue } from "./PayAtVenue";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Paiement",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Page de paiement d'une vente sur place, ouverte en scannant le QR code de l'équipe (section 9.27). */
export default async function PayPage({
  params,
}: {
  params: Promise<{ sub: string; token: string }>;
}) {
  const { sub, token } = await params;
  const org = await getPublicOrganization(sub);
  if (!org) notFound();
  const t = await getTranslations("public");
  const r = await reservationByToken(token.slice(0, 120));
  const event = r
    ? await db.event.findFirst({
        where: { orders: { some: { id: r.orderId } }, organizationId: org.id },
        select: { title: true, requireBuyerPhone: true },
      })
    : null;
  return (
    <main className="min-h-dvh bg-surface px-5 py-10 text-ink">
      <div className="mx-auto grid max-w-lg gap-5">
        {r && event ? (
          <>
            <header className="grid gap-1">
              <p className="text-sm text-ink-muted">{t("payTitle")}</p>
              <h1 className="font-display text-3xl tracking-[-0.03em]">
                {event.title}
              </h1>
            </header>
            <PayAtVenue
              reservation={{
                token: r.token,
                reference: r.reference,
                expiresAt: r.expiresAt.toISOString(),
                currency: r.currency,
                totalMinor: r.totalMinor,
                isFree: r.isFree,
                discountMinor: r.discountMinor,
                promoCode: r.promoCode,
                lines: r.lines,
                options: r.options ?? [],
                questions: r.questions,
                stripeAccountId: r.stripeAccountId,
                seats: await reservationSeats(r.orderId),
              }}
              organizationName={org.brand?.displayName ?? org.name}
              requirePhone={event.requireBuyerPhone}
              publishableKey={
                process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null
              }
            />
          </>
        ) : (
          <p className="text-lg">{t("payUnavailable")}</p>
        )}
      </div>
    </main>
  );
}
