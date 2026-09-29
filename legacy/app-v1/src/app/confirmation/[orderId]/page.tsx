import { db } from "@evoly/db";
import { notFound } from "next/navigation";
import { generateQrDataUrl } from "@/lib/qrcode";

export default async function ConfirmationPage({
	params,
}: {
	params: Promise<{ orderId: string }>;
}) {
	const { orderId } = await params;

	const order = await db.order.findUnique({
		where: { id: orderId },
		include: {
			event: {
				select: {
					title: true,
					startsAt: true,
					endsAt: true,
					locationName: true,
					locationAddress: true,
					locationType: true,
					confirmationMessage: true,
					organization: { select: { name: true, slug: true, brand: { select: { primaryColor: true, logoUrl: true, brandName: true } } } },
				},
			},
			tickets: {
				where: { status: "ACTIVE" },
				select: {
					id: true,
					qrCode: true,
					holderFirstName: true,
					holderLastName: true,
				},
				take: 3, // Show max 3 QR codes on confirmation
			},
			items: true,
		},
	});

	if (!order) notFound();

	// Order still PENDING: webhook not yet received, show processing state
	if (order.status === "PENDING") {
		return (
			<div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
				<div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md w-full text-center space-y-4">
					<div className="w-14 h-14 bg-violet-100 rounded-full flex items-center justify-center mx-auto">
						<svg className="animate-spin w-6 h-6 text-violet-600" fill="none" viewBox="0 0 24 24">
							<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
							<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
						</svg>
					</div>
					<h1 className="text-lg font-semibold text-gray-900">Paiement en cours de traitement…</h1>
					<p className="text-sm text-gray-500">
						Votre paiement a été reçu. Vos billets vous seront envoyés par email dans quelques instants.
					</p>
					<meta httpEquiv="refresh" content="5" />
				</div>
			</div>
		);
	}

	if (order.status === "CANCELLED") {
		return (
			<div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
				<div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md w-full text-center space-y-4">
					<div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto">
						<svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
						</svg>
					</div>
					<h1 className="text-lg font-semibold text-gray-900">Paiement échoué</h1>
					<p className="text-sm text-gray-500">
						Votre paiement n&apos;a pas pu être traité. Aucun montant n&apos;a été débité.
					</p>
				</div>
			</div>
		);
	}

	const event = order.event;
	const brand = event.organization.brand;
	const primaryColor = brand?.primaryColor ?? "#7c3aed";
	const brandName = brand?.brandName ?? "evoly";
	const brandLogo = brand?.logoUrl;
	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.evoly.me";

	// Generate QR for first ticket preview
	const firstTicketQr = order.tickets[0]
		? await generateQrDataUrl(order.tickets[0].qrCode)
		: null;

	const pdfUrl = `${appUrl}/api/tickets/pdf?token=${order.magicToken}&print=1`;
	const ticketsUrl = `${appUrl}/tickets/${order.magicToken}`;

	const shareText = `Je viens d'acheter mon billet pour ${event.title} !`;
	const shareUrl = `${appUrl}/e/${encodeURIComponent(event.title)}`;

	return (
		<div className="min-h-screen bg-gray-50">
			{/* Header */}
			<div className="bg-white border-b border-gray-200 px-4 py-4">
				<div className="max-w-lg mx-auto flex items-center justify-between">
					{brandLogo ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img src={brandLogo} alt={brandName} className="h-7 w-auto" />
				) : (
					<span className="font-bold text-lg" style={{ color: primaryColor }}>{brandName}</span>
				)}
					<span className="text-sm text-gray-500">
						{event.organization.name}
					</span>
				</div>
			</div>

			<div className="max-w-lg mx-auto px-4 py-8 space-y-5">
				{/* Success header */}
				<div className="bg-white rounded-2xl border border-gray-200 p-6 text-center space-y-2">
					<div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
						<svg
							className="w-7 h-7 text-green-600"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2.5}
								d="M5 13l4 4L19 7"
							/>
						</svg>
					</div>
					<h1 className="text-lg font-bold text-gray-900">
						Paiement confirmé !
					</h1>
					<p className="text-sm text-gray-500">
						Vos billets ont été envoyés à <strong>{order.buyerEmail}</strong>
					</p>
				</div>

				{/* Custom confirmation message */}
				{event.confirmationMessage && (
					<div className="bg-violet-50 rounded-2xl border border-violet-100 p-4">
						<p className="text-sm text-violet-800">
							{event.confirmationMessage}
						</p>
					</div>
				)}

				{/* Event info */}
				<div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
					<h2 className="text-base font-bold text-gray-900">{event.title}</h2>
					<div className="space-y-1.5 text-sm text-gray-500">
						<p className="flex items-center gap-2">
							<span>📅</span>
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
							<p className="flex items-center gap-2">
								<span>📍</span>
								{event.locationName}
								{event.locationAddress && (
									<span className="text-gray-400">
										· {event.locationAddress}
									</span>
								)}
							</p>
						)}
					</div>

					<div className="pt-2 border-t border-gray-100 flex items-center justify-between">
						<div className="text-sm">
							<span className="text-gray-500">
								{order.items.reduce((a, i) => a + i.quantity, 0)} billet(s)
							</span>
						</div>
						<div className="text-sm font-bold text-gray-900">
							{order.totalCents === 0
								? "Gratuit"
								: `${(order.totalCents / 100).toFixed(2)}€`}
						</div>
					</div>
				</div>

				{/* First QR code preview */}
				{firstTicketQr && (
					<div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4">
						<img
							src={firstTicketQr}
							alt="QR Code"
							width={80}
							height={80}
							className="rounded-lg border border-gray-100 flex-shrink-0"
						/>
						<div>
							<p className="text-sm font-semibold text-gray-900">
								Votre billet
							</p>
							<p className="text-xs text-gray-500 mt-0.5">
								{order.tickets.length > 1
									? `+${order.tickets.length - 1} autre(s) billet(s)`
									: "Présentez ce QR code à l'entrée"}
							</p>
							<a
								href={ticketsUrl}
								className="text-xs text-violet-600 hover:underline mt-1 inline-block"
							>
								Voir tous mes billets →
							</a>
						</div>
					</div>
				)}

				{/* Actions */}
				<div className="space-y-2">
					<a
						href={ticketsUrl}
						className="block w-full py-3 text-white text-sm font-semibold rounded-xl transition-colors text-center" style={{ backgroundColor: primaryColor }}
					>
						🎟️ Voir mes billets
					</a>
					<a
						href={pdfUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="block w-full py-2.5 border border-gray-300 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-center"
					>
						📄 Télécharger / Imprimer les billets
					</a>
				</div>

				{/* Share */}
				<div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
					<p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
						Partager l'événement
					</p>
					<div className="flex gap-2">
						{[
							{
								name: "Twitter / X",
								emoji: "𝕏",
								href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
							},
							{
								name: "Facebook",
								emoji: "f",
								href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
							},
							{
								name: "WhatsApp",
								emoji: "💬",
								href: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`,
							},
						].map((s) => (
							<a
								key={s.name}
								href={s.href}
								target="_blank"
								rel="noopener noreferrer"
								className="flex-1 py-2 border border-gray-200 rounded-xl text-center text-sm hover:bg-gray-50 transition-colors"
								aria-label={s.name}
							>
								{s.emoji}
							</a>
						))}
					</div>
				</div>

				<p className="text-center text-xs text-gray-400 pb-4">
					Commande #{order.id.slice(-8).toUpperCase()} ·{" "}
					<a href={`/refund/${order.magicToken}`} className="hover:underline">
						Demander un remboursement
					</a>
				</p>
			</div>
		</div>
	);
}
