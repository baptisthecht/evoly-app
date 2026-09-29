import { db } from "@evoly/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

interface Props {
	params: Promise<{ orgSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { orgSlug } = await params;
	const org = await getOrg(orgSlug);
	if (!org) return { title: "Organisation introuvable" };
	return {
		title: `${org.name} — Événements`,
		description: org.description ?? undefined,
	};
}

async function getOrg(slug: string) {
	// Support previous subdomain redirect
	return db.organization.findFirst({
		where: { OR: [{ slug }, { previousSubdomain: slug }] },
		include: {
			brand: { select: { primaryColor: true, logoUrl: true, brandName: true } },
			events: {
				where: { status: "PUBLISHED", OR: [{ startsAt: { gte: new Date() } }, { endsAt: { gte: new Date() } }] },
				orderBy: { startsAt: "asc" },
				take: 12,
				include: {
					ticketTypes: {
						where: { status: "ACTIVE" },
						select: { id: true },
					},
				},
			},
		},
	});
}

export default async function OrgPublicPage({ params }: Props) {
	const { orgSlug } = await params;
	const org = await getOrg(orgSlug);

	if (!org) notFound();

	const brand = org.brand;
	const primaryColor = brand?.primaryColor ?? "#7c3aed";
	const brandName = brand?.brandName ?? "evoly";
	const brandLogo = brand?.logoUrl ?? org.logoUrl;

	// Redirect if old subdomain
	if (org.previousSubdomain === orgSlug && org.slug !== orgSlug) {
		const { redirect } = await import("next/navigation");
		redirect(`/o/${org.slug}`);
	}

	return (
		<div className="min-h-screen bg-gray-50">
			{/* Navbar */}
			<nav className="bg-white border-b border-gray-200 px-4 py-3">
				<div className="max-w-4xl mx-auto flex items-center gap-3">
					{brandLogo ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img src={brandLogo} alt={brandName} className="h-8 w-auto" />
					) : (
						<span className="font-bold text-lg" style={{ color: primaryColor }}>{brandName}</span>
					)}
				</div>
			</nav>

			<div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
				{/* Header */}
				<div>
					{org.description && (
						<p className="text-gray-600 text-sm mt-1">{org.description}</p>
					)}
				</div>

				{/* Events grid */}
				{org.events.length === 0 ? (
					<div className="text-center py-16">
						<p className="text-2xl mb-2">🎟️</p>
						<p className="text-gray-500">
							Aucun événement à venir pour le moment.
						</p>
					</div>
				) : (
					<div>
						<h2 className="text-base font-semibold text-gray-900 mb-4">
							Événements à venir
						</h2>
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
							{org.events.map((event) => (
								<Link
									key={event.id}
									href={`/e/${event.slug}`}
									className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow group"
								>
									<div className="h-36 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${primaryColor}cc, ${primaryColor})` }}>
										{event.bannerUrl && (
											// eslint-disable-next-line @next/next/no-img-element
											<img
												src={event.bannerUrl}
												alt=""
												className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
											/>
										)}
									</div>
									<div className="p-4">
										<p className="text-xs font-medium mb-1" style={{ color: primaryColor }}>
											{new Date(event.startsAt).toLocaleDateString("fr-FR", {
												weekday: "short",
												day: "numeric",
												month: "short",
											})}
										</p>
										<p className="text-sm font-semibold text-gray-900 line-clamp-2">
											{event.title}
										</p>
										{event.locationName && (
											<p className="text-xs text-gray-400 mt-1 truncate">
												📍 {event.locationName}
											</p>
										)}
										<div className="mt-2">
											{event.ticketTypes?.length === 0 ? (
												<span className="text-xs text-gray-400">Complet</span>
											) : (
												<span className="text-xs font-medium text-gray-700">
													Voir les billets →
												</span>
											)}
										</div>
									</div>
								</Link>
							))}
						</div>
					</div>
				)}

				<p className="text-center text-xs text-gray-300 pt-4">
					Billetterie propulsée par{" "}
					<a href="https://evoly.me" className="text-gray-400 hover:underline">
						evoly
					</a>
				</p>
			</div>
		</div>
	);
}
