import { db } from "@evoly/db";

type NotificationType =
  | "NEW_ORDER"
  | "REFUND_REQUEST"
  | "MEMBER_JOINED"
  | "PAYMENT_FAILED"
  | "QUOTA_ALERT"
  | "PAYOUT_FAILED"
  | "EVENT_CANCELLED";

export async function createNotification({
  organizationId,
  type,
  title,
  message,
  link,
}: {
  organizationId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}) {
  try {
    await (db as any).notification.create({
      data: { organizationId, type, title, message, link: link ?? null },
    });
  } catch (e) {
    // Non-blocking — don't fail the main operation if notification fails
    console.error("[createNotification] error:", e);
  }
}
