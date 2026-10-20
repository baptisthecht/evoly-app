import type { Metadata } from "next";
import { requireStaff } from "@/server/platform";
import { PromotionForm } from "../PromotionForm";
import { emptyPromotion } from "../values";

export const metadata: Metadata = { title: "Nouvelle offre" };

export default async function NewOfferPage() {
  await requireStaff("ADMIN");
  return (
    <main className="mx-auto grid max-w-4xl gap-6 p-6">
      <h1 className="font-display text-3xl">Nouvelle offre</h1>
      <PromotionForm id={null} values={emptyPromotion} />
    </main>
  );
}
