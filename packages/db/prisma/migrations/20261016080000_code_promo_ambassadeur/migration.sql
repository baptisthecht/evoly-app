-- Code promo d'un ambassadeur, avec sa réduction (RG-AMB-01)
ALTER TABLE "PromoCode" ADD COLUMN "ambassadorId" TEXT;
CREATE UNIQUE INDEX "PromoCode_ambassadorId_key" ON "PromoCode"("ambassadorId");
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "Ambassador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
