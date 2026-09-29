"use server";

import { db } from "@evoly/db";
import { stripe } from "@/lib/stripe";
import { z } from "zod";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { OrderConfirmationEmail } from "@evoly/email";
import { render } from "@react-email/components";
import crypto from "crypto";

// ─────────────────────────────────────────
// VALIDATE PROMO CODE
// ─────────────────────────────────────────

export async function validatePromoCodeAction(eventId: string, code: string) {
	const promo = await db.promoCode.findUnique({
		where: { eventId_code: { eventId, code: code.toUpperCase() } },
	});

	if (!promo || !promo.isActive) return { error: "Code invalide ou inactif." };
	if (promo.expiresAt && promo.expiresAt < new Date())
		return { error: "Ce code a expiré." };
	if (promo.maxUses && promo.usedCount >= promo.maxUses)
		return { error: "Ce code a atteint sa limite d'utilisations." };

	return {
		success: true,
		promo: {
			id: promo.id,
			code: promo.code,
			type: promo.type,
			value: promo.value,
			ticketTypeIds: promo.ticketTypeIds,
		},
	};
}

// ─────────────────────────────────────────
// CREATE FREE ORDER (no Stripe needed)
// ─────────────────────────────────────────

const checkoutSchema = z.object({
	eventId: z.string(),
	buyerEmail: z.string().min(1).refine(e => e.includes("@"), { message: "Email invalide" }),
	buyerFirstName: z.string().min(1),
	buyerLastName: z.string().min(1),
	buyerPhone: z.string().optional().nullable(),
	promoCodeId: z.string().optional().nullable(),
	items: z.array(
		z.object({
			ticketTypeId: z.string(),
			quantity: z.coerce.number().int().min(1),
			holderData: z
				.array(
					z.object({
						firstName: z.string().optional(),
						lastName: z.string().optional(),
						email: z.string().optional(),
						phone: z.string().optional(),
					}),
				)
				.optional(),
			seatIds: z.array(z.string()).optional(),
		}),
	),
});

export async function createFreeOrderAction(data: unknown) {
	const parsed = checkoutSchema.safeParse(data);
	if (!parsed.success) return { error: "Données invalides." };

	const {
		eventId,
		buyerEmail,
		buyerFirstName,
		buyerLastName,
		buyerPhone,
		promoCodeId,
		items,
	} = parsed.data;

	// Load event + ticket types
	const event = await db.event.findUnique({
		where: { id: eventId },
		include: {
			ticketTypes: true,
			organization: { select: { planId: true, ticketsSoldThisMonth: true } },
		},
	});
	if (!event || event.status !== "PUBLISHED")
		return { error: "Événement introuvable ou non publié." };

	// Validate all items are free
	for (const item of items) {
		const tt = event.ticketTypes.find((t) => t.id === item.ticketTypeId);
		if (!tt) return { error: "Type de ticket introuvable." };
		if (tt.priceCents > 0 && !promoCodeId)
			return { error: "Ce ticket nécessite un paiement." };
		if (tt.quantity !== null && tt.quantitySold + item.quantity > tt.quantity) {
			return { error: `Plus assez de places disponibles pour "${tt.name}".` };
		}
		// Validate seat count matches quantity if seats provided
		if (item.seatIds && item.seatIds.length > 0 && item.seatIds.length !== item.quantity) {
			return { error: "Le nombre de sièges sélectionnés ne correspond pas à la quantité de billets." };
		}
	}

	// Validate seats are still available (if applicable)
	const allSeatIds = items.flatMap((i) => i.seatIds ?? []);
	if (allSeatIds.length > 0) {
		const seats = await db.seat.findMany({
			where: { id: { in: allSeatIds } },
			select: { id: true, status: true, label: true },
		});
		for (const seat of seats) {
			if (seat.status !== "AVAILABLE") {
				return { error: `Le siège ${seat.label} n'est plus disponible.` };
			}
		}
	}

	// Create order + tickets in transaction
	const order = await db.$transaction(async (tx) => {
		const newOrder = await tx.order.create({
			data: {
				eventId,
				buyerEmail,
				buyerFirstName,
				buyerLastName,
				buyerPhone: buyerPhone || null,
				subtotalCents: 0,
				discountCents: 0,
				feesCents: 0,
				totalCents: 0,
				promoCodeId: promoCodeId || null,
				status: "COMPLETED",
				items: {
					create: items.map((item) => ({
						ticketTypeId: item.ticketTypeId,
						quantity: item.quantity,
						unitPriceCents: 0,
						customFields: item.seatIds && item.seatIds.length > 0
							? { seatIds: item.seatIds }
							: undefined,
					})),
				},
			},
		});

		// Create tickets, mark seats as SOLD
		for (const item of items) {
			const tt = event.ticketTypes.find((t) => t.id === item.ticketTypeId)!;
			for (let i = 0; i < item.quantity; i++) {
				const holder = item.holderData?.[i];
				const seatId = item.seatIds?.[i];
				await tx.ticket.create({
					data: {
						orderId: newOrder.id,
						orderItemId: newOrder.id,
						qrCode: crypto.randomUUID(),
						holderFirstName: holder?.firstName || buyerFirstName,
						holderLastName: holder?.lastName || buyerLastName,
						holderEmail: holder?.email || buyerEmail,
						status: "ACTIVE",
						seatId: seatId ?? null,
					},
				});
				if (seatId) {
					await tx.seat.update({ where: { id: seatId }, data: { status: "SOLD" } });
				}
			}

			// Decrement stock
			await tx.ticketType.update({
				where: { id: item.ticketTypeId },
				data: { quantitySold: { increment: item.quantity } },
			});
		}

		return newOrder;
	});

	// Send confirmation email for free orders
	try {
		const fullOrder = await db.order.findUnique({
			where: { id: order.id },
			include: {
				items: true,
				event: {
					select: {
						title: true, startsAt: true, locationName: true,
						confirmationMessage: true,
						organization: { select: { brand: true } },
					},
				},
			},
		});
		if (fullOrder) {
			const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.evoly.me";
			const ticketCount = fullOrder.items.reduce((a, i) => a + i.quantity, 0);
			const brand = fullOrder.event.organization.brand as { primaryColor?: string; logoUrl?: string; brandName?: string; fromName?: string } | null;
			const html = await render(OrderConfirmationEmail({
				buyerName: `${fullOrder.buyerFirstName} ${fullOrder.buyerLastName}`,
				eventTitle: fullOrder.event.title,
				eventDate: new Date(fullOrder.event.startsAt).toLocaleDateString("fr-FR", {
					weekday: "long", day: "numeric", month: "long", year: "numeric",
					hour: "2-digit", minute: "2-digit",
				}),
				eventLocation: fullOrder.event.locationName ?? null,
				ticketCount,
				totalCents: 0,
				magicToken: fullOrder.magicToken,
				appUrl,
				confirmationMessage: fullOrder.event.confirmationMessage ?? null,
				brand: brand ?? null,
			}));
			const fromName = brand?.fromName;
			await resend.emails.send({
				from: fromName ? `${fromName} <noreply@evoly.me>` : FROM_EMAIL,
				to: fullOrder.buyerEmail,
				subject: `🎟️ Vos billets pour ${fullOrder.event.title}`,
				html,
			});
		}
	} catch (emailErr) {
		console.error("[Free order confirmation email error]", emailErr);
	}

	return { success: true, orderId: order.id, magicToken: order.magicToken };
}

// ─────────────────────────────────────────
// CREATE PAYMENT INTENT (paid tickets)
// ─────────────────────────────────────────

export async function createPaymentIntentAction(data: unknown) {
	try { return await _createPaymentIntentAction(data); }
	catch (e) { console.error("[createPaymentIntentAction] CRASH:", e); return { error: String(e) }; }
}

async function _createPaymentIntentAction(data: unknown) {
	const parsed = checkoutSchema.safeParse(data);
	if (!parsed.success) {
		console.error("[PI] Zod errors:", JSON.stringify(parsed.error.issues, null, 2));
		return { error: "Données invalides.", details: parsed.error.issues };
	}

	const {
		eventId,
		buyerEmail,
		buyerFirstName,
		buyerLastName,
		buyerPhone,
		promoCodeId,
		items,
	} = parsed.data;

	const event = await db.event.findUnique({
		where: { id: eventId },
		include: {
			ticketTypes: true,
			organization: {
				select: {
					stripeAccountId: true,
					stripeAccountStatus: true,
					planId: true,
					ticketsSoldThisMonth: true,
				},
			},
		},
	});

	if (!event || event.status !== "PUBLISHED")
		return { error: "Événement introuvable." };
	if (
		!event.organization.stripeAccountId ||
		event.organization.stripeAccountStatus !== "ACTIVE"
	) {
		return { error: "Paiement non disponible pour cet événement." };
	}

	// Validate seats if provided
	const allSeatIds = items.flatMap((i) => i.seatIds ?? []);
	if (allSeatIds.length > 0) {
		const seats = await db.seat.findMany({
			where: { id: { in: allSeatIds } },
			select: { id: true, status: true, label: true },
		});
		for (const seat of seats) {
			if (seat.status !== "AVAILABLE") {
				return { error: `Le siège ${seat.label} n'est plus disponible.` };
			}
		}
	}

	// Calculate totals
	let subtotal = 0;
	let discount = 0;

	let promo = null;
	if (promoCodeId) {
		promo = await db.promoCode.findUnique({ where: { id: promoCodeId } });
	}

	for (const item of items) {
		const tt = event.ticketTypes.find((t) => t.id === item.ticketTypeId);
		if (!tt) return { error: "Type de ticket introuvable." };
		if (tt.quantity !== null && tt.quantitySold + item.quantity > tt.quantity) {
			return { error: `Plus assez de places pour "${tt.name}".` };
		}

		let unitPrice = tt.priceCents;
		if (
			promo &&
			(promo.ticketTypeIds.length === 0 || promo.ticketTypeIds.includes(tt.id))
		) {
			if (promo.type === "PERCENTAGE") {
				unitPrice = Math.round(unitPrice * (1 - promo.value / 100));
			} else if (promo.type === "FIXED") {
				unitPrice = Math.max(0, unitPrice - promo.value);
			}
		}

		subtotal += tt.priceCents * item.quantity;
		discount += (tt.priceCents - unitPrice) * item.quantity;
	}

	const discountedTotal = subtotal - discount;

	// Commission calculation
	const plan = await db.plan.findUnique({
		where: { id: event.organization.planId },
	});
	const quota = plan?.monthlyFreeQuota ?? 30;
	const commissionRate = plan?.commissionRate ?? 0.05;
	const ticketsSold = event.organization.ticketsSoldThisMonth;
	const totalQty = items.reduce((a, i) => a + i.quantity, 0);
	const freeRemaining = Math.max(0, quota - ticketsSold);
	const paidQty = Math.max(0, totalQty - freeRemaining);
	const avgPrice = totalQty > 0 ? discountedTotal / totalQty : 0;
	const fees = Math.round(paidQty * avgPrice * commissionRate);

	const total = discountedTotal;

	// Create pending order + reserve seats atomically
	const order = await db.$transaction(async (tx) => {
		// Reserve seats
		if (allSeatIds.length > 0) {
			await tx.seat.updateMany({
				where: { id: { in: allSeatIds }, status: "AVAILABLE" },
				data: { status: "RESERVED" },
			});
		}

		const newOrder = await tx.order.create({
			data: {
				eventId,
				buyerEmail,
				buyerFirstName,
				buyerLastName,
				buyerPhone: buyerPhone || null,
				subtotalCents: subtotal,
				discountCents: discount,
				feesCents: fees,
				totalCents: total,
				promoCodeId: promoCodeId || null,
				status: "PENDING",
				items: {
					create: items.map((item) => {
						const tt = event.ticketTypes.find((t) => t.id === item.ticketTypeId)!;
						return {
							ticketTypeId: item.ticketTypeId,
							quantity: item.quantity,
							unitPriceCents: tt.priceCents,
							customFields: item.seatIds && item.seatIds.length > 0
								? { seatIds: item.seatIds }
								: undefined,
						};
					}),
				},
			},
		});

		return newOrder;
	});

	// Create Stripe PaymentIntent with application_fee_amount
	const paymentIntent = await stripe.paymentIntents.create({
		amount: total,
		currency: "eur",
		application_fee_amount: fees,
		transfer_data: {
			destination: event.organization.stripeAccountId,
		},
		metadata: {
			orderId: order.id,
			eventId,
		},
		automatic_payment_methods: { enabled: true },
	});

	// Link PaymentIntent to order
	await db.order.update({
		where: { id: order.id },
		data: { stripePaymentIntentId: paymentIntent.id },
	});

	return {
		success: true,
		orderId: order.id,
		totalCents: total,
		feesCents: fees,
		clientSecret: paymentIntent.client_secret,
	};
}
