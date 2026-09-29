import { NextRequest, NextResponse } from "next/server";
import { createNotification } from "@/lib/notifications";
import { stripe } from "@/lib/stripe";
import { db } from "@evoly/db";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { OrderConfirmationEmail } from "@evoly/email";
import { render } from "@react-email/components";
import crypto from "crypto";
import { captureException } from "@/lib/sentry";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      // ── Billetterie ──────────────────────────

      case "payment_intent.succeeded": {
        const pi = event.data.object as any;

        // ── Revente ──────────────────────────────────────────────
        if (pi.metadata?.resaleLinkToken) {
          const resaleLink = await db.resaleLink.findUnique({
            where: { token: pi.metadata.resaleLinkToken },
            include: {
              ticket: {
                include: {
                  order: {
                    include: {
                      event: { select: { id: true, title: true, startsAt: true, locationName: true, organizationId: true } },
                    },
                  },
                },
              },
            },
          });

          if (!resaleLink || resaleLink.status !== "PENDING") break;

          // Invalidate old ticket, create new one with new QR
          const newQrCode = crypto.randomUUID();
          await db.$transaction(async (tx) => {
            // Old ticket → CANCELLED
            await tx.ticket.update({
              where: { id: resaleLink.ticketId },
              data: { status: "CANCELLED" },
            });

            // New ticket for buyer
            const newTicket = await tx.ticket.create({
              data: {
                orderId: resaleLink.ticket.orderId,
                orderItemId: resaleLink.ticket.orderItemId,
                qrCode: newQrCode,
                holderFirstName: resaleLink.buyerFirstName ?? "",
                holderLastName: resaleLink.buyerLastName ?? "",
                holderEmail: resaleLink.buyerEmail ?? "",
                status: "ACTIVE",
              },
            });

            // Mark resale as SOLD
            await tx.resaleLink.update({
              where: { id: resaleLink.id },
              data: { status: "SOLD", soldAt: new Date() },
            });

            return newTicket;
          });

          // Send confirmation email to buyer
          try {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.evoly.me";
            await resend.emails.send({
              from: FROM_EMAIL,
              to: resaleLink.buyerEmail!,
              subject: `🎟️ Votre billet (revente) — ${resaleLink.ticket.order.event.title}`,
              html: `<p>Bonjour ${resaleLink.buyerFirstName},</p>
              <p>Votre achat de billet en revente pour <strong>${resaleLink.ticket.order.event.title}</strong> est confirmé !</p>
              <p>📅 ${new Date(resaleLink.ticket.order.event.startsAt).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>
              <p>Votre QR code : <strong>${newQrCode}</strong></p>
              <p style="margin-top:16px"><a href="${appUrl}/e/${resaleLink.ticket.order.event.id}" style="color:#7c3aed">Voir l'événement →</a></p>`,
            });
          } catch (emailErr) {
            console.error("[Resale confirmation email error]", emailErr);
          }

          break;
        }

        // ── Billetterie classique ────────────────────────────────
        const order = await db.order.findFirst({
          where: { stripePaymentIntentId: pi.id },
          include: {
            items: true,
            event: { include: { organization: { include: { brand: true } } } },
          },
        });
        if (!order || order.status === "COMPLETED") break;

        await db.$transaction(async (tx) => {
          await tx.order.update({
            where: { id: order.id },
            data: { status: "COMPLETED" },
          });

          // Create tickets (with seat assignment if applicable)
          for (const item of order.items) {
            const seatIds: string[] = (item.customFields as { seatIds?: string[] } | null)?.seatIds ?? [];
            for (let i = 0; i < item.quantity; i++) {
              const seatId = seatIds[i] ?? null;
              await tx.ticket.create({
                data: {
                  orderId: order.id,
                  orderItemId: item.id,
                  qrCode: crypto.randomUUID(),
                  holderFirstName: order.buyerFirstName,
                  holderLastName: order.buyerLastName,
                  holderEmail: order.buyerEmail,
                  status: "ACTIVE",
                  seatId,
                },
              });
              if (seatId) {
                await tx.seat.update({ where: { id: seatId }, data: { status: "SOLD" } });
              }
            }
            await tx.ticketType.update({
              where: { id: item.ticketTypeId },
              data: { quantitySold: { increment: item.quantity } },
            });
          }

          // Quota
          const totalQty = order.items.reduce((a: number, i) => a + i.quantity, 0);
          await tx.organization.update({
            where: { id: order.event.organizationId },
            data: { ticketsSoldThisMonth: { increment: totalQty } },
          });

          // Referral reward — fire on first paid sale
          const hasPaidItems = order.items.some((i) => i.unitPriceCents > 0);


          // Quota alerts
          const updatedOrg = await tx.organization.findUnique({
            where: { id: order.event.organizationId },
            include: {
              plan: true,
              members: {
                where: { role: { permissions: { has: "BILLING_MANAGE" } } },
                include: { user: { select: { email: true, name: true } } },
              },
            },
          });
          if (updatedOrg) {
            const quota = updatedOrg.plan.monthlyFreeQuota;
            const sold = updatedOrg.ticketsSoldThisMonth + totalQty;
            const pct = quota > 0 ? (sold / quota) * 100 : 0;
            const prevPct = quota > 0 ? ((sold - totalQty) / quota) * 100 : 0;
            const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.evoly.me";

            if (prevPct < 80 && pct >= 80 && pct < 100) {
              for (const member of updatedOrg.members) {
                if (!member.user.email) continue;
                await resend.emails.send({
                  from: FROM_EMAIL,
                  to: member.user.email,
                  subject: "⚠️ Quota Evoly : 80% atteint",
                  html: `<p>Bonjour ${member.user.name ?? ""},</p><p>Vous avez utilisé <strong>80%</strong> de votre quota mensuel (${sold}/${quota} tickets payants). Au-delà, une commission de ${(updatedOrg.plan.commissionRate * 100).toFixed(1)}% s'applique.</p><p><a href="${appUrl}/dashboard/${updatedOrg.slug}/billing">Passer au Pro →</a></p>`,
                }).catch(console.error);
              }
            }
            if (prevPct < 100 && pct >= 100) {
              for (const member of updatedOrg.members) {
                if (!member.user.email) continue;
                await resend.emails.send({
                  from: FROM_EMAIL,
                  to: member.user.email,
                  subject: "🔴 Quota Evoly dépassé — commission activée",
                  html: `<p>Bonjour ${member.user.name ?? ""},</p><p>Vous avez dépassé votre quota mensuel de ${quota} tickets gratuits. Une commission de <strong>${(updatedOrg.plan.commissionRate * 100).toFixed(1)}%</strong> s'applique maintenant sur chaque vente.</p><p><a href="${appUrl}/dashboard/${updatedOrg.slug}/billing">Gérer mon abonnement →</a></p>`,
                }).catch(console.error);
              }
            }
          }

          // Reserve 20%
          const reserveAmount = Math.round(order.totalCents * 0.2);
          const availableAmount = order.totalCents - order.feesCents - reserveAmount;

          await tx.reserve.create({
            data: {
              organizationId: order.event.organizationId,
              orderId: order.id,
              amountCents: reserveAmount,
              releasesAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          });

          // Confirmation email
          try {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.evoly.me";
            const ticketCount = order.items.reduce((a: number, i) => a + i.quantity, 0);
            const html = await render(OrderConfirmationEmail({
              buyerName: `${order.buyerFirstName} ${order.buyerLastName}`,
              eventTitle: order.event.title,
              eventDate: new Date(order.event.startsAt).toLocaleDateString("fr-FR", {
                weekday: "long", day: "numeric", month: "long", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              }),
              eventLocation: order.event.locationName ?? null,
              ticketCount,
              totalCents: order.totalCents,
              magicToken: order.magicToken,
              appUrl,
              confirmationMessage: order.event.confirmationMessage ?? null,
              brand: order.event.organization.brand ?? null,
            }));
            const fromName = order.event.organization.brand?.fromName;
            await resend.emails.send({
              from: fromName ? `${fromName} <${FROM_EMAIL}>` : FROM_EMAIL,
              to: order.buyerEmail,
              subject: `🎟️ Vos billets pour ${order.event.title}`,
              html,
            });
          } catch (emailErr) {
            console.error("[Confirmation email error]", emailErr);
          }

          // In-app notification
          const notifQty = order.items.reduce((a: number, i) => a + i.quantity, 0);
          await createNotification({
            organizationId: order.event.organizationId,
            type: "NEW_ORDER",
            title: "Nouvelle commande",
            message: `${order.buyerFirstName} ${order.buyerLastName} a acheté ${notifQty} billet(s) pour ${order.event.title}`,
            link: `/dashboard/${order.event.organization.slug}/events/${order.event.slug}/orders`,
          });

          // Credit balance
          await tx.organization.update({
            where: { id: order.event.organizationId },
            data: { availableBalanceCents: { increment: Math.max(0, availableAmount) } },
          });
        });
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object as any;
        const failedOrder = await db.order.findFirst({
          where: { stripePaymentIntentId: pi.id },
          include: { items: true },
        });
        if (failedOrder) {
          const reservedSeatIds = failedOrder.items.flatMap(
            (item) => (item.customFields as { seatIds?: string[] } | null)?.seatIds ?? []
          );
          await db.$transaction(async (tx) => {
            await tx.order.update({
              where: { id: failedOrder.id },
              data: { status: "CANCELLED" },
            });
            if (reservedSeatIds.length > 0) {
              await tx.seat.updateMany({
                where: { id: { in: reservedSeatIds }, status: "RESERVED" },
                data: { status: "AVAILABLE" },
              });
            }
          });
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as any;
        const order = await db.order.findFirst({
          where: { stripePaymentIntentId: charge.payment_intent },
        });
        if (order) {
          await db.refundRequest.updateMany({
            where: { orderId: order.id, status: "APPROVED" },
            data: { status: "PROCESSED" },
          });
        }
        break;
      }

      // ── Abonnements Pro ──────────────────────

      case "checkout.session.completed": {
        const session = event.data.object as any;
        const organizationId = session.metadata?.organizationId;
        if (!organizationId || session.mode !== "subscription") break;

        await db.organization.update({
          where: { id: organizationId },
          data: {
            planId: "pro",
            stripeSubscriptionId: session.subscription,
            subscriptionStatus: session.subscription ? "TRIALING" : "ACTIVE",
            trialEndsAt: session.subscription
              ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
              : null,
          },
        });

        // Parrainage : récompenser parrain + filleul si achat annuel
        const isYearly = session.metadata?.billing === "yearly";
        if (isYearly) {
          const { triggerReferralRewardAction } = await import("@/actions/referral");
          triggerReferralRewardAction(organizationId).catch(console.error);
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as any;
        if (!invoice.subscription) break;

        const org = await db.organization.findFirst({
          where: { stripeSubscriptionId: invoice.subscription },
        });
        if (!org) break;

        await db.organization.update({
          where: { id: org.id },
          data: {
            planId: "pro",
            subscriptionStatus: "ACTIVE",
            ticketsSoldThisMonth: 0,
            quotaResetAt: new Date(),
          },
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as any;
        if (!invoice.subscription) break;

        const org = await db.organization.findFirst({
          where: { stripeSubscriptionId: invoice.subscription },
        });
        if (!org) break;

        await db.organization.update({
          where: { id: org.id },
          data: { subscriptionStatus: "PAST_DUE" },
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as any;
        const org = await db.organization.findFirst({
          where: { stripeSubscriptionId: sub.id },
        });
        if (!org) break;

        await db.organization.update({
          where: { id: org.id },
          data: {
            planId: "free",
            subscriptionStatus: "CANCELED",
            stripeSubscriptionId: null,
            trialEndsAt: null,
          },
        });
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as any;
        const org = await db.organization.findFirst({
          where: { stripeSubscriptionId: sub.id },
        });
        if (!org) break;

        const statusMap: Record<string, string> = {
          active: "ACTIVE",
          trialing: "TRIALING",
          past_due: "PAST_DUE",
          canceled: "CANCELED",
          unpaid: "PAST_DUE",
        };

        await db.organization.update({
          where: { id: org.id },
          data: {
            subscriptionStatus: (statusMap[sub.status] ?? "INACTIVE") as any,
            subscriptionEndsAt: sub.current_period_end
              ? new Date(sub.current_period_end * 1000)
              : null,
          },
        });
        break;
      }

      // ── Stripe Connect ────────────────────────

      case "account.updated": {
        const account = event.data.object as any;
        const org = await db.organization.findFirst({
          where: { stripeAccountId: account.id },
        });
        if (!org) break;

        let status: string = "PENDING";
        if (account.charges_enabled && account.payouts_enabled) {
          status = "ACTIVE";
        } else if (account.requirements?.disabled_reason) {
          status = "RESTRICTED";
        } else if (account.requirements?.errors?.length > 0) {
          status = "RESTRICTED";
        } else if (account.requirements?.eventually_due?.length > 0) {
          status = "RESTRICTED_SOON";
        }

        await db.organization.update({
          where: { id: org.id },
          data: { stripeAccountStatus: status as any },
        });
        break;
      }

      // transfer.paid / transfer.failed ne sont pas des event types Stripe standard
      // On utilise payout.paid / payout.failed à la place
      case "payout.paid": {
        const payout = event.data.object as any;
        await db.payout.updateMany({
          where: { stripePayoutId: payout.id },
          data: { status: "PAID", paidAt: new Date() },
        });
        break;
      }

      case "payout.failed": {
        const payout = event.data.object as any;
        const dbPayout = await db.payout.findFirst({
          where: { stripePayoutId: payout.id },
        });
        if (dbPayout) {
          await db.payout.update({
            where: { id: dbPayout.id },
            data: {
              status: "FAILED",
              failureReason: payout.failure_message ?? "Échec du virement",
            },
          });
          await db.organization.update({
            where: { id: dbPayout.organizationId },
            data: { availableBalanceCents: { increment: dbPayout.amountCents } },
          });
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("[Stripe Webhook Error]", err);
    captureException(err, { eventType: event?.type, handler: "stripe-webhook" });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
