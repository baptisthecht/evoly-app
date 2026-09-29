import { db } from "@evoly/db";
import { notFound } from "next/navigation";
import { generateQrDataUrl } from "@/lib/qrcode";
import { ResaleButton } from "@/components/resale/ResaleButton";

export default async function MagicTicketsPage({
	params,
}: {
	params: Promise<{ magicToken: string }>;
}) {
	const { magicToken } = await params;

	const order = await db.order.findUnique({
		where: { magicToken },
		include: {
			event: {
				select: {
					title: true,
					startsAt: true,
					endsAt: true,
					locationName: true,
					locationAddress: true,
					locationType: true,
					organization: {
						select: {
							name: true,
							logoUrl: true,
							brand: {
								select: { brandName: true, logoUrl: true, primaryColor: true },
							},
						},
					},
				},
			},
			tickets: {
				where: { status: { in: ["ACTIVE", "USED"] } },
				include: {
					seat: true,
					resaleLink: {
						select: { token: true, priceCents: true, status: true, expiresAt: true },
					},
				},
			},
			items: true,
		},
	});

	if (!order) notFound();

	const event = order.event;
	const brand = event.organization.brand;
	const primaryColor = brand?.primaryColor ?? "#7c3aed";
	const brandName = brand?.brandName ?? "evoly";
	const brandLogo = brand?.logoUrl ?? event.organization.logoUrl;

	const ticketsWithQr = await Promise.all(
		order.tickets.map(async (ticket) => ({
			...ticket,
			qrDataUrl: await generateQrDataUrl(ticket.qrCode),
		})),
	);

	const pdfUrl = `/api/tickets/pdf?token=${magicToken}`;

	return (
		<div className="min-h-screen bg-gray-50">
			<nav className="bg-white border-b border-gray-200 px-4 py-3">
				<div className="max-w-xl mx-auto flex items-center justify-between">
					{brandLogo ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img src={brandLogo} alt={brandName} className="h-7 w-auto" />
					) : (
						<span className="font-bold text-lg" style={{ color: primaryColor }}>
							{brandName}
						</span>
					)}
					<div className="flex items-center gap-3">
						<span className="text-sm text-gray-500">{event.organization.name}</span>
						<a
							href={`${pdfUrl}&print=1`}
							target="_blank"
							rel="noopener noreferrer"
							className="text-xs px-3 py-1.5 text-white rounded-full hover:opacity-90 transition-opacity"
							style={{ backgroundColor: primaryColor }}
						>
							📄 Imprimer / PDF
						</a>
					</div>
				</div>
			</nav>

			<div className="max-w-xl mx-auto px-4 py-8 space-y-6">
				<div className="bg-white rounded-2xl border border-gray-200 p-5">
					<h1 className="text-lg font-bold text-gray-900">{event.title}</h1>
					<div className="mt-3 space-y-1.5 text-sm text-gray-500">
						<p>
							📅{" "}
							{new Date(event.startsAt).toLocaleDateString("fr-FR", {
								weekday: "long",
								day: "numeric",
								month: "long",
								year: "numeric",
								hour: "2-digit",
								minute: "2-digit",
							})}
						</p>
						{event.locationName && (
							<p>
								📍 {event.locationName}
								{event.locationAddress ? ` · ${event.locationAddress}` : ""}
							</p>
						)}
					</div>
				</div>

				<div className="bg-white rounded-2xl border border-gray-200 p-5">
					<div className="flex items-center justify-between mb-3">
						<h2 className="text-sm font-semibold text-gray-900">
							Commande #{order.id.slice(-8).toUpperCase()}
						</h2>
						<span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
							Confirmée
						</span>
					</div>
					<p className="text-sm text-gray-600">
						{order.buyerFirstName} {order.buyerLastName} · {order.buyerEmail}
					</p>
					<p className="text-sm font-semibold text-gray-900 mt-1">
						Total:{" "}
						{order.totalCents === 0 ? "Gratuit" : `${(order.totalCents / 100).toFixed(2)}€`}
					</p>
				</div>

				<div className="space-y-3">
					<div className="flex items-center justify-between px-1">
						<h2 className="text-sm font-semibold text-gray-900">
							{ticketsWithQr.length} billet{ticketsWithQr.length > 1 ? "s" : ""}
						</h2>
						<a
							href={pdfUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-xs hover:underline"
							style={{ color: primaryColor }}
						>
							Télécharger tous les PDF →
						</a>
					</div>

					{ticketsWithQr.map((ticket, i) => (
						<div
							key={ticket.id}
							className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
						>
							<div
								className="px-5 py-3 flex items-center justify-between"
								style={{ backgroundColor: primaryColor }}
							>
								<span className="text-xs font-semibold text-white/80 uppercase tracking-wide">
									Billet {i + 1}
									{ticketsWithQr.length > 1 ? ` / ${ticketsWithQr.length}` : ""}
								</span>
								<span
									className={`text-xs px-2 py-0.5 rounded-full font-medium ${
										ticket.checkedIn
											? "bg-white/20 text-white"
											: "bg-green-400/20 text-green-200"
									}`}
								>
									{ticket.checkedIn ? "✓ Utilisé" : "✓ Valide"}
								</span>
							</div>

							<div className="p-5 flex items-start gap-4">
								<div className="flex-1">
									<p className="text-base font-bold text-gray-900">
										{ticket.holderFirstName ?? order.buyerFirstName}{" "}
										{ticket.holderLastName ?? order.buyerLastName}
									</p>
									{ticket.holderEmail && (
										<p className="text-xs text-gray-400 mt-0.5">{ticket.holderEmail}</p>
									)}
									{ticket.seat && (
										<div className="mt-2">
											<span
												className="text-xs font-semibold px-2 py-1 rounded-lg"
												style={{
													color: primaryColor,
													backgroundColor: `${primaryColor}18`,
												}}
											>
												📍 Place {ticket.seat.label}
											</span>
										</div>
									)}
									<div className="mt-3 flex items-center gap-4">
										<a
											href={`${pdfUrl}&ticketId=${ticket.id}&print=1`}
											target="_blank"
											rel="noopener noreferrer"
											className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
										>
											📄 PDF individuel
										</a>
										{!ticket.checkedIn && ticket.status === "ACTIVE" && (
											<ResaleButton
												ticketId={ticket.id}
												magicToken={magicToken}
												originalPriceCents={
													order.items.find(
														(item) => item.id === ticket.orderItemId,
													)?.unitPriceCents ?? 0
												}
												eventStartsAt={event.startsAt.toISOString()}
												existingResale={
													ticket.resaleLink
														? {
																token: ticket.resaleLink.token,
																priceCents: ticket.resaleLink.priceCents,
																status: ticket.resaleLink.status,
																expiresAt: ticket.resaleLink.expiresAt.toISOString(),
															}
														: null
												}
											/>
										)}
									</div>
								</div>

								<div className="flex-shrink-0">
									{/* eslint-disable-next-line @next/next/no-img-element */}
									<img
										src={ticket.qrDataUrl}
										alt={`QR Code billet ${i + 1}`}
										width={100}
										height={100}
										className="rounded-lg border border-gray-100"
									/>
								</div>
							</div>

							<div className="px-5 pb-4">
								<p className="text-[10px] text-gray-300 font-mono break-all">
									{ticket.qrCode}
								</p>
							</div>
						</div>
					))}
				</div>

				<div className="text-center space-y-1 pb-4">
					<p className="text-xs text-gray-400">
						Gardez cette page accessible pour le check-in · evoly.me
					</p>
					<a
						href={`/refund/${magicToken}`}
						className="text-xs text-gray-400 hover:underline transition-colors"
					>
						Demander un remboursement
					</a>
				</div>
			</div>
		</div>
	);
}
