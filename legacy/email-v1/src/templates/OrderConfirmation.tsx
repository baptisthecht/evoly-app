import * as React from "react";
import {
	Html,
	Head,
	Preview,
	Body,
	Container,
	Section,
	Text,
	Button,
	Hr,
	Heading,
} from "@react-email/components";

interface OrderConfirmationEmailProps {
	buyerName: string;
	eventTitle: string;
	eventDate: string;
	eventLocation: string | null;
	ticketCount: number;
	totalCents: number;
	magicToken: string;
	appUrl?: string;
	confirmationMessage?: string | null;
	// Brand (Pro orgs with custom domain)
	brand?: {
		brandName?: string | null;
		logoUrl?: string | null;
		primaryColor?: string | null;
		fromName?: string | null;
	} | null;
}

export function OrderConfirmationEmail({
	buyerName,
	eventTitle,
	eventDate,
	eventLocation,
	ticketCount,
	totalCents,
	magicToken,
	appUrl = "https://app.evoly.me",
	confirmationMessage,
	brand,
}: OrderConfirmationEmailProps) {
	const ticketsUrl = `${appUrl}/tickets/${magicToken}`;
	const primaryColor = brand?.primaryColor ?? "#7c3aed";
	const displayName = brand?.brandName ?? "evoly";

	return (
		<Html>
			<Head />
			<Preview>
				✅ Vos billets pour {eventTitle} — Confirmation de commande
			</Preview>
			<Body style={body}>
				<Container style={container}>
					{/* Logo */}
					<Section style={{ textAlign: "center", padding: "32px 0 24px" }}>
						<Text
							style={{
								fontSize: 22,
								fontWeight: 700,
								color: primaryColor,
								margin: 0,
							}}
						>
							{displayName}
						</Text>
					</Section>

					{/* Success badge */}
					<Section style={{ textAlign: "center", marginBottom: 24 }}>
						<Text style={{ fontSize: 48, margin: 0 }}>🎟️</Text>
						<Heading style={h1}>Commande confirmée !</Heading>
						<Text style={subtitle}>
							Bonjour {buyerName}, vos billets sont prêts.
						</Text>
					</Section>

					{/* Event info */}
					<Section style={card}>
						<Text style={cardTitle}>{eventTitle}</Text>
						<Hr style={divider} />
						<Row label="📅 Date" value={eventDate} />
						{eventLocation && <Row label="📍 Lieu" value={eventLocation} />}
						<Row
							label="🎟️ Billets"
							value={`${ticketCount} billet${ticketCount > 1 ? "s" : ""}`}
						/>
						<Row
							label="💳 Total"
							value={
								totalCents === 0
									? "Gratuit"
									: `${(totalCents / 100).toFixed(2)}€`
							}
						/>
					</Section>

					{/* Custom message */}
					{confirmationMessage && (
						<Section
							style={{
								...card,
								backgroundColor: "#f5f3ff",
								border: "1px solid #ede9fe",
							}}
						>
							<Text
								style={{
									fontSize: 14,
									color: "#6d28d9",
									margin: 0,
									lineHeight: "1.6",
								}}
							>
								{confirmationMessage}
							</Text>
						</Section>
					)}

					{/* CTA */}
					<Section style={{ textAlign: "center", margin: "28px 0" }}>
						<Button href={ticketsUrl} style={{ ...button, backgroundColor: primaryColor }}>
							Voir mes billets →
						</Button>
						<Text style={{ fontSize: 12, color: "#9ca3af", marginTop: 12 }}>
							Ou copiez ce lien : {ticketsUrl}
						</Text>
					</Section>

					<Hr style={divider} />

					{/* Footer */}
					<Section style={{ textAlign: "center" }}>
						<Text style={footer}>
							Cet email de confirmation est envoyé automatiquement.
							<br />
							Des questions ? Contactez l&apos;organisateur de l&apos;événement.
						</Text>
						<Text style={{ ...footer, marginTop: 8 }}>
							<a href={`${appUrl}/unsubscribe`} style={{ color: "#9ca3af" }}>
								Se désinscrire des emails marketing
							</a>
						</Text>
						<Text style={{ ...footer, fontSize: 11 }}>
							© Evoly · La billetterie honnête
						</Text>
					</Section>
				</Container>
			</Body>
		</Html>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<Section
			style={{
				display: "flex",
				justifyContent: "space-between",
				padding: "4px 0",
			}}
		>
			<Text style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>{label}</Text>
			<Text
				style={{ fontSize: 14, color: "#111827", fontWeight: 500, margin: 0 }}
			>
				{value}
			</Text>
		</Section>
	);
}

// Styles
const body: React.CSSProperties = {
	backgroundColor: "#f9fafb",
	fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const container: React.CSSProperties = {
	maxWidth: 520,
	margin: "0 auto",
	backgroundColor: "#ffffff",
	borderRadius: 16,
	overflow: "hidden",
};

const h1: React.CSSProperties = {
	fontSize: 24,
	fontWeight: 700,
	color: "#111827",
	margin: "8px 0 4px",
};

const subtitle: React.CSSProperties = {
	fontSize: 15,
	color: "#6b7280",
	margin: 0,
};

const card: React.CSSProperties = {
	backgroundColor: "#f9fafb",
	borderRadius: 12,
	padding: "16px 20px",
	margin: "0 24px 16px",
};

const cardTitle: React.CSSProperties = {
	fontSize: 16,
	fontWeight: 700,
	color: "#111827",
	margin: "0 0 12px",
};

const button: React.CSSProperties = {
	backgroundColor: "#7c3aed",
	color: "#ffffff",
	borderRadius: 12,
	padding: "12px 28px",
	fontSize: 15,
	fontWeight: 600,
	textDecoration: "none",
	display: "inline-block",
};

const divider: React.CSSProperties = {
	border: "none",
	borderTop: "1px solid #e5e7eb",
	margin: "8px 0",
};

const footer: React.CSSProperties = {
	fontSize: 12,
	color: "#9ca3af",
	margin: 0,
	lineHeight: "1.5",
};
