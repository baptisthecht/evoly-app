import { NextRequest, NextResponse } from "next/server";
import { db } from "@evoly/db";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { captureException } from "@/lib/sentry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called hourly — sends email automations at the right time
export async function GET(req: NextRequest) {
	const secret = req.headers.get("x-cron-secret");
	if (secret !== process.env.CRON_SECRET) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
	const now = new Date();
	const sent: string[] = [];

	// ── J-7 / J-1 / J-0 reminders ───────────────────────────────
	const reminderConfigs = [
		{
			type: "REMINDER_J7" as const,
			daysOffset: 7,
			subject: (title: string) => `📅 Dans 7 jours : ${title}`,
		},
		{
			type: "REMINDER_J1" as const,
			daysOffset: 1,
			subject: (title: string) => `⏰ Demain : ${title}`,
		},
		{
			type: "REMINDER_J0" as const,
			daysOffset: 0,
			subject: (title: string) => `🎉 C'est aujourd'hui : ${title}`,
		},
	];

	for (const config of reminderConfigs) {
		const targetDate = new Date(now);
		targetDate.setDate(targetDate.getDate() + config.daysOffset);
		targetDate.setHours(0, 0, 0, 0);
		const targetEnd = new Date(targetDate);
		targetEnd.setHours(23, 59, 59, 999);

		// Find events starting on the target day with automation enabled
		const automations = await db.emailAutomation.findMany({
			where: {
				type: config.type,
				enabled: true,
				lastSentAt: null, // not sent yet for this event
				event: {
					status: "PUBLISHED",
					startsAt: { gte: targetDate, lte: targetEnd },
				},
			},
			include: {
				event: {
					select: {
						id: true,
						title: true,
						startsAt: true,
						locationName: true,
						locationAddress: true,
						streamUrl: true,
						locationType: true,
						organization: { select: { name: true, slug: true, planId: true } },
					},
				},
			},
		});

		for (const automation of automations) {
			const event = automation.event;
			const orders = await db.order.findMany({
				where: { eventId: event.id, status: "COMPLETED" },
				select: { buyerEmail: true, buyerFirstName: true },
			});

			let emailsSent = 0;
			const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.evoly.me";

			for (const order of orders) {
				// Check unsubscribe
				const unsub = await db.emailUnsubscribe.findFirst({
					where: {
						email: order.buyerEmail,
						OR: [
							{ organizationId: event.organization ? undefined : undefined },
							{ eventId: event.id },
						],
					},
				});
				if (unsub) continue;

				try {
					const locationLine =
						event.locationType === "ONLINE"
							? "En ligne"
							: [event.locationName, event.locationAddress]
									.filter(Boolean)
									.join(" — ");

					await resend.emails.send({
						from: FROM_EMAIL,
						to: order.buyerEmail,
						subject: config.subject(event.title),
						html: buildReminderHtml({
							buyerName: order.buyerFirstName,
							eventTitle: event.title,
							eventDate: new Date(event.startsAt).toLocaleDateString("fr-FR", {
								weekday: "long",
								day: "numeric",
								month: "long",
								hour: "2-digit",
								minute: "2-digit",
							}),
							location: locationLine,
							daysOffset: config.daysOffset,
							appUrl,
							orgName: event.organization.name,
							orgSlug: event.organization.slug,
							eventId: event.id,
						}),
					});
					emailsSent++;
				} catch (e) {
					console.error(`[cron/email-automations] Send error:`, e);
				}
			}

			// Mark automation as sent
			await db.emailAutomation.update({
				where: { id: automation.id },
				data: { lastSentAt: now },
			});

			sent.push(`${config.type} → ${event.title} (${emailsSent} emails)`);
		}
	}

	// ── POST_EVENT ────────────────────────────────────────────────
	const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
	const postEventAutomations = await db.emailAutomation.findMany({
		where: {
			type: "POST_EVENT",
			enabled: true,
			lastSentAt: null,
			event: {
				status: "PUBLISHED",
				endsAt: { gte: twoHoursAgo, lte: now },
			},
		},
		include: {
			event: {
				select: {
					id: true,
					title: true,
					endsAt: true,
					organization: { select: { name: true, slug: true } },
				},
			},
		},
	});

	for (const automation of postEventAutomations) {
		const event = automation.event;
		const orders = await db.order.findMany({
			where: { eventId: event.id, status: "COMPLETED" },
			select: { buyerEmail: true, buyerFirstName: true },
		});

		let emailsSent = 0;
		const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.evoly.me";

		for (const order of orders) {
			try {
				await resend.emails.send({
					from: FROM_EMAIL,
					to: order.buyerEmail,
					subject: `Merci d'être venu — ${event.title}`,
					html: buildPostEventHtml({
						buyerName: order.buyerFirstName,
						eventTitle: event.title,
						orgName: event.organization.name,
						orgSlug: event.organization.slug,
						appUrl,
						eventId: event.id,
					}),
				});
				emailsSent++;
			} catch (e) {
				console.error(`[cron/email-automations] Post-event send error:`, e);
			}
		}

		await db.emailAutomation.update({
			where: { id: automation.id },
			data: { lastSentAt: now },
		});

		sent.push(`POST_EVENT → ${event.title} (${emailsSent} emails)`);
	}

	// ── Scheduled campaigns ───────────────────────────────────────
	const scheduledCampaigns = await db.emailCampaign.findMany({
		where: {
			status: "SCHEDULED",
			scheduledAt: { lte: now },
		},
		include: {
			event: { select: { id: true, title: true, organizationId: true } },
		},
	});

	for (const campaign of scheduledCampaigns) {
		// Mark as sending immediately to prevent double-send
		await db.emailCampaign.update({
			where: { id: campaign.id },
			data: { status: "SENDING" },
		});

		const orders = await db.order.findMany({
			where: { eventId: campaign.event.id, status: "COMPLETED" },
			select: { buyerEmail: true, buyerFirstName: true },
		});

		let emailsSent = 0;
		const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.evoly.me";

		for (const order of orders) {
			const unsub = await db.emailUnsubscribe.findFirst({
				where: {
					email: order.buyerEmail,
					OR: [
						{ organizationId: campaign.event.organizationId },
						{ eventId: campaign.event.id },
					],
				},
			});
			if (unsub) continue;

			try {
				await resend.emails.send({
					from: FROM_EMAIL,
					to: order.buyerEmail,
					subject: campaign.subject,
					html: `<p>Bonjour ${order.buyerFirstName},</p><p>${campaign.subject}</p>
            <hr/><p style="font-size:11px;color:#9ca3af">
            <a href="${appUrl}/unsubscribe?email=${encodeURIComponent(order.buyerEmail)}&eventId=${campaign.event.id}">Se désinscrire</a>
            </p>`,
				});
				emailsSent++;
			} catch (e) {
				console.error(`[cron/email-automations] Campaign send error:`, e);
			}
		}

		await db.emailCampaign.update({
			where: { id: campaign.id },
			data: { status: "SENT", sentAt: now, recipientCount: emailsSent },
		});

		sent.push(`CAMPAIGN → ${campaign.subject} (${emailsSent} emails)`);
	}

	console.log(`[cron/email-automations] Sent: ${sent.length} batches`);
	return NextResponse.json({ sent });
	} catch (err) {
		console.error("[cron/email-automations] Error:", err);
		captureException(err, { cron: "email-automations" });
		return NextResponse.json({ error: "Internal error" }, { status: 500 });
	}
}

// ── Email HTML builders ──────────────────────────────────────────

function buildReminderHtml({
	buyerName,
	eventTitle,
	eventDate,
	location,
	daysOffset,
	appUrl,
	orgName,
	orgSlug,
	eventId,
}: {
	buyerName: string;
	eventTitle: string;
	eventDate: string;
	location: string;
	daysOffset: number;
	appUrl: string;
	orgName: string;
	orgSlug: string;
	eventId: string;
}) {
	const intro =
		daysOffset === 7
			? `votre événement a lieu dans <strong>7 jours</strong>`
			: daysOffset === 1
				? `votre événement a lieu <strong>demain</strong>`
				: `votre événement a lieu <strong>aujourd'hui</strong>`;

	return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f9fafb;margin:0;padding:24px">
    <div style="max-width:520px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
      <div style="background:#7c3aed;padding:24px 32px">
        <p style="color:white;font-size:22px;font-weight:700;margin:0">evoly</p>
      </div>
      <div style="padding:32px">
        <p style="color:#374151">Bonjour ${buyerName},</p>
        <p style="color:#374151">Rappel : ${intro}.</p>
        <div style="background:#f5f3ff;border-radius:12px;padding:16px 20px;margin:20px 0">
          <p style="font-weight:700;color:#111827;margin:0 0 8px">${eventTitle}</p>
          <p style="color:#6b7280;font-size:14px;margin:0">📅 ${eventDate}</p>
          ${location ? `<p style="color:#6b7280;font-size:14px;margin:4px 0 0">📍 ${location}</p>` : ""}
        </div>
        <p style="font-size:12px;color:#9ca3af;margin-top:24px">
          Organisé par ${orgName} · 
          <a href="${appUrl}/unsubscribe?eventId=${eventId}" style="color:#9ca3af">Se désinscrire</a>
        </p>
      </div>
    </div>
  </body></html>`;
}

function buildPostEventHtml({
	buyerName,
	eventTitle,
	orgName,
	orgSlug,
	appUrl,
	eventId,
}: {
	buyerName: string;
	eventTitle: string;
	orgName: string;
	orgSlug: string;
	appUrl: string;
	eventId: string;
}) {
	return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f9fafb;margin:0;padding:24px">
    <div style="max-width:520px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
      <div style="background:#7c3aed;padding:24px 32px">
        <p style="color:white;font-size:22px;font-weight:700;margin:0">evoly</p>
      </div>
      <div style="padding:32px">
        <p style="color:#374151">Bonjour ${buyerName},</p>
        <p style="color:#374151">Merci d'avoir participé à <strong>${eventTitle}</strong> ! Nous espérons que vous avez passé un excellent moment.</p>
        <p style="color:#6b7280;font-size:14px">Restez connecté avec ${orgName} pour ne pas manquer les prochains événements.</p>
        <p style="font-size:12px;color:#9ca3af;margin-top:24px">
          <a href="${appUrl}/o/${orgSlug}" style="color:#7c3aed">Voir les prochains événements</a> · 
          <a href="${appUrl}/unsubscribe?eventId=${eventId}" style="color:#9ca3af">Se désinscrire</a>
        </p>
      </div>
    </div>
  </body></html>`;
}
