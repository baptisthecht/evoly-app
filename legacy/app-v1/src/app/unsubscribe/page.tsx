import { db } from "@evoly/db";
import { UnsubscribeForm } from "./UnsubscribeForm";

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; orgId?: string; eventId?: string }>;
}) {
  const { email, orgId, eventId } = await searchParams;

  const orgName = orgId
    ? (await db.organization.findUnique({ where: { id: orgId }, select: { name: true } }))?.name
    : null;

  const eventTitle = eventId
    ? (await db.event.findUnique({ where: { id: eventId }, select: { title: true } }))?.title
    : null;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-sm w-full space-y-5 text-center">
        <div className="text-3xl">✉️</div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Désinscription</h1>
          <p className="text-sm text-gray-500 mt-1">
            {eventTitle
              ? `Emails pour « ${eventTitle} »`
              : orgName
              ? `Emails de ${orgName}`
              : "Tous les emails marketing Evoly"}
          </p>
        </div>
        <UnsubscribeForm
          email={email ?? ""}
          orgId={orgId ?? null}
          eventId={eventId ?? null}
        />
      </div>
    </div>
  );
}
