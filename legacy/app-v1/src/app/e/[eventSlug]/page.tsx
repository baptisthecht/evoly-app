import { db } from "@evoly/db";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { EventPublicPage } from "@/components/public/EventPublicPage";
import { getPublicSeatingMapAction } from "@/actions/seating";

interface Props {
	params: Promise<{ eventSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { eventSlug } = await params;
	const event = await getEvent(eventSlug);
	if (!event) return { title: "Événement introuvable" };

	return {
		title: event.title,
		description:
			event.description?.replace(/<[^>]*>/g, "").slice(0, 160) ?? undefined,
		openGraph: {
			title: event.title,
			description:
				event.description?.replace(/<[^>]*>/g, "").slice(0, 160) ?? undefined,
			images: event.bannerUrl ? [event.bannerUrl] : [],
		},
	};
}

async function getEvent(slug: string) {
	return db.event.findFirst({
		where: { slug, status: "PUBLISHED" },
		select: {
			id: true, title: true, description: true, bannerUrl: true,
			startsAt: true, endsAt: true, timezone: true,
			locationType: true, locationName: true, locationAddress: true,
			refundPolicy: true, refundDeadlineDays: true, confirmationMessage: true,
			slug: true, status: true, organizationId: true,
			seatingType: true, allowSeatChoice: true,
			organization: {
				select: {
					id: true, name: true, slug: true, logoUrl: true,
					stripeAccountStatus: true,
					brand: { select: { brandName: true, logoUrl: true, primaryColor: true, accentColor: true, fromName: true } },
				},
			},
			ticketTypes: {
				where: { status: "ACTIVE" },
				orderBy: { sortOrder: "asc" },
				select: {
					id: true, name: true, description: true, priceCents: true, currency: true,
					quantity: true, quantitySold: true, maxPerOrder: true, minPerOrder: true,
					isNominative: true, saleStartsAt: true, saleEndsAt: true,
					seatingCategoryId: true,
				},
			},
		},
	});
}

export default async function PublicEventPage({ params }: Props) {
	const { eventSlug } = await params;
	const event = await getEvent(eventSlug);

	if (!event) notFound();

	// Fetch seating map if event uses assigned seating with buyer seat choice
	const seatingMap = event.seatingType === "ASSIGNED" && event.allowSeatChoice
		? await getPublicSeatingMapAction(event.id)
		: null;

	// Get other events from same org
	const otherEvents = await db.event.findMany({
		where: {
			organizationId: event.organizationId,
			status: "PUBLISHED",
			id: { not: event.id },
			startsAt: { gte: new Date() },
		},
		orderBy: { startsAt: "asc" },
		take: 3,
		select: {
			id: true, title: true, slug: true, startsAt: true, bannerUrl: true,
		},
	});

	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.evoly.me";

	// JSON-LD structured data for SEO
	const jsonLd = {
		"@context": "https://schema.org",
		"@type": "Event",
		name: event.title,
		startDate: event.startsAt.toISOString(),
		endDate: event.endsAt?.toISOString(),
		description: event.description?.replace(/<[^>]*>/g, "").slice(0, 500),
		image: event.bannerUrl,
		url: `${appUrl}/e/${event.slug}`,
		organizer: {
			"@type": "Organization",
			name: event.organization.name,
		},
		...(event.locationType === "PHYSICAL" && event.locationName
			? {
					location: {
						"@type": "Place",
						name: event.locationName,
						address: event.locationAddress ?? undefined,
					},
				}
			: event.locationType === "ONLINE"
				? { location: { "@type": "VirtualLocation", url: appUrl } }
				: {}),
		offers: event.ticketTypes.map((tt) => ({
			"@type": "Offer",
			name: tt.name,
			price: (tt.priceCents / 100).toFixed(2),
			priceCurrency: tt.currency,
			availability:
				tt.quantity && tt.quantitySold >= tt.quantity
					? "https://schema.org/SoldOut"
					: "https://schema.org/InStock",
			url: `${appUrl}/e/${event.slug}`,
		})),
	};

	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
			/>
			<EventPublicPage
				event={{
					id: event.id,
					title: event.title,
					description: event.description,
					bannerUrl: event.bannerUrl,
					startsAt: event.startsAt.toISOString(),
					endsAt: event.endsAt?.toISOString() ?? null,
					timezone: event.timezone,
					locationType: event.locationType,
					locationName: event.locationName,
					locationAddress: event.locationAddress,
					refundPolicy: event.refundPolicy,
					refundDeadlineDays: event.refundDeadlineDays,
					confirmationMessage: event.confirmationMessage,
					allowSeatChoice: event.allowSeatChoice,
					organization: event.organization,
					ticketTypes: event.ticketTypes.map((tt) => ({
						id: tt.id,
						name: tt.name,
						description: tt.description,
						priceCents: tt.priceCents,
						currency: tt.currency,
						quantity: tt.quantity,
						quantitySold: tt.quantitySold,
						maxPerOrder: tt.maxPerOrder,
						minPerOrder: tt.minPerOrder,
						isNominative: tt.isNominative,
						saleStartsAt: tt.saleStartsAt?.toISOString() ?? null,
						saleEndsAt: tt.saleEndsAt?.toISOString() ?? null,
						seatingCategoryId: tt.seatingCategoryId,
					})),
				}}
				otherEvents={otherEvents.map((e) => ({
					id: e.id,
					title: e.title,
					slug: e.slug,
					startsAt: e.startsAt.toISOString(),
					bannerUrl: e.bannerUrl,
				}))}
				seatingMap={seatingMap}
			/>
		</>
	);
}
