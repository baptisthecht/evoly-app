import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@evoly/db";
import { CreateEventWizard } from "@/components/events/CreateEventWizard";

export default async function NewEventPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { orgSlug } = await params;

  const org = await db.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true, slug: true, name: true, timezone: true, stripeAccountStatus: true },
  });
  if (!org) redirect("/dashboard");

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <a href={`/dashboard/${orgSlug}/events`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Événements
        </a>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Nouvel événement</h1>
      </div>
      <CreateEventWizard
        organizationId={org.id}
        orgSlug={org.slug}
        orgTimezone={org.timezone}
        stripeConnected={org.stripeAccountStatus === "ACTIVE"}
      />
    </div>
  );
}
