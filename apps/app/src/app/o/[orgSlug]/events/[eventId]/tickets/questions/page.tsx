import { can } from "@evoly/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/server/context";
import { getEventWithTickets } from "@/server/events";
import { listQuestions } from "@/server/questions";
import { QuestionsManager } from "../QuestionsManager";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("questions") };
}

/** Billetterie, questions à l'achat. */
export default async function QuestionsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const event = await getEventWithTickets(ctx, eventId);
  return (
    <QuestionsManager
      orgSlug={orgSlug}
      eventId={eventId}
      readOnly={!can(ctx.membership, "TICKETS_MANAGE") || ctx.readOnly}
      ticketTypes={event.ticketTypes.map((tt) => ({
        id: tt.id,
        name: tt.name,
      }))}
      questions={(await listQuestions(ctx, eventId)).map((q) => ({
        id: q.id,
        label: q.label,
        helpText: q.helpText,
        type: q.type,
        options: (q.options as string[] | null) ?? null,
        required: q.required,
        scope: q.scope,
        ticketTypeIds: q.ticketTypeIds,
        archived: !!q.archivedAt,
        answers: q._count.answers,
      }))}
    />
  );
}
