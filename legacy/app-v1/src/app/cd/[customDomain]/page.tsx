import { db } from "@evoly/db";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ customDomain: string }>;
}

export default async function CustomDomainPage({ params }: Props) {
  const { customDomain } = await params;

  const domain = await db.customDomain.findUnique({
    where: { domain: customDomain, status: "ACTIVE" },
    include: {
      organization: { select: { slug: true } },
      event: { select: { slug: true, organizationId: true } },
    },
  });

  if (!domain) notFound();

  // Redirect to the canonical URL
  if (domain.scope === "EVENT" && domain.event) {
    redirect(`/e/${domain.event.slug}`);
  } else {
    redirect(`/o/${domain.organization.slug}`);
  }
}
