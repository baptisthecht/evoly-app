import { db } from "@evoly/db";
import Link from "next/link";

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ payment_intent?: string }>;
}

export default async function ResaleConfirmationPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { payment_intent } = await searchParams;

  const resaleLink = await db.resaleLink.findUnique({
    where: { token },
    include: {
      ticket: {
        include: {
          order: {
            include: {
              event: { select: { title: true, slug: true, startsAt: true } },
            },
          },
        },
      },
    },
  });

  const event = resaleLink?.ticket.order.event;
  const isSold = resaleLink?.status === "SOLD";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md w-full text-center">
        {isSold ? (
          <>
            <p className="text-5xl mb-4">🎟️</p>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Billet obtenu !</h1>
            <p className="text-gray-500 text-sm mb-6">
              Votre billet pour <strong>{event?.title}</strong> vous a été envoyé par email.
            </p>
            <p className="text-xs text-gray-400">
              Un lien pour accéder à votre billet vous a été envoyé à l&apos;adresse indiquée lors du paiement.
            </p>
          </>
        ) : (
          <>
            <p className="text-5xl mb-4">⏳</p>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Paiement en cours de vérification</h1>
            <p className="text-gray-500 text-sm mb-6">
              Votre paiement est en cours de traitement. Vous recevrez votre billet par email dans quelques instants.
            </p>
          </>
        )}
        {event && (
          <Link
            href={`/e/${event.slug}`}
            className="text-sm text-violet-600 hover:underline"
          >
            Voir la page de l&apos;événement →
          </Link>
        )}
      </div>
    </div>
  );
}
