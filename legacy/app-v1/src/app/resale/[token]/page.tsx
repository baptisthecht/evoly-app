import { db } from "@evoly/db";
import { notFound } from "next/navigation";
import { ResalePurchasePage } from "@/components/resale/ResalePurchasePage";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function ResalePage({ params }: Props) {
  const { token } = await params;

  const resaleLink = await db.resaleLink.findUnique({
    where: { token },
    include: {
      ticket: {
        include: {
          order: {
            include: {
              event: {
                select: {
                  id: true,
                  title: true,
                  startsAt: true,
                  endsAt: true,
                  timezone: true,
                  locationType: true,
                  locationName: true,
                  locationAddress: true,
                  bannerUrl: true,
                  slug: true,
                  organization: {
                    select: {
                      name: true,
                      slug: true,
                      stripeAccountId: true,
                      stripeAccountStatus: true,
                      brand: {
                        select: { primaryColor: true, logoUrl: true, brandName: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!resaleLink) notFound();

  // Auto-expire
  if (resaleLink.status === "OPEN" && new Date() > resaleLink.expiresAt) {
    await db.resaleLink.update({ where: { token }, data: { status: "EXPIRED" } });
  }

  const event = resaleLink.ticket.order.event;
  const brand = event.organization.brand;
  const primaryColor = brand?.primaryColor ?? "#7c3aed";

  const statusMessages: Record<string, string> = {
    SOLD: "Ce billet a déjà été vendu.",
    CANCELLED: "Ce lien de revente a été annulé par le vendeur.",
    EXPIRED: "Ce lien de revente a expiré.",
    PENDING: "Un achat est déjà en cours pour ce billet.",
  };

  if (resaleLink.status !== "OPEN") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md w-full text-center">
          <p className="text-4xl mb-4">🚫</p>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Lien indisponible</h1>
          <p className="text-gray-500 text-sm">{statusMessages[resaleLink.status]}</p>
          <a
            href={`/e/${event.slug}`}
            className="mt-6 inline-block text-sm font-medium"
            style={{ color: primaryColor }}
          >
            Voir la page de l&apos;événement →
          </a>
        </div>
      </div>
    );
  }

  return (
    <ResalePurchasePage
      token={token}
      resaleLink={{
        priceCents: resaleLink.priceCents,
        originalPriceCents: resaleLink.originalPriceCents,
        expiresAt: resaleLink.expiresAt.toISOString(),
      }}
      event={{
        id: event.id,
        title: event.title,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt?.toISOString() ?? null,
        timezone: event.timezone,
        locationType: event.locationType,
        locationName: event.locationName,
        locationAddress: event.locationAddress,
        bannerUrl: event.bannerUrl,
        slug: event.slug,
        organization: {
          name: event.organization.name,
          slug: event.organization.slug,
          stripeAccountStatus: event.organization.stripeAccountStatus,
          brand: brand ?? null,
        },
      }}
    />
  );
}
