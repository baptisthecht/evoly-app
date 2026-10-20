import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireStaff } from "@/server/platform";
import { PromotionForm } from "../PromotionForm";
import { promotionValues } from "../values";

export const metadata: Metadata = { title: "Offre" };

export default async function EditOfferPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("ADMIN");
  const p = await db.promotion.findUnique({ where: { id: (await params).id } });
  if (!p) notFound();
  return (
    <main className="mx-auto grid max-w-4xl gap-6 p-6">
      <h1 className="font-display text-3xl">{p.name}</h1>
      <p className="text-sm text-ink-muted">{p.redeemedCount} organisation(s) en ont profité. Une modification ne change pas les offres déjà attribuées.</p>
      <PromotionForm id={p.id} values={promotionValues(p)} />
    </main>
  );
}
