-- Retrait des options sans réseau (RG-OPT-05)
ALTER TABLE "OptionRedemption" ADD COLUMN "offline" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "OptionRedemptionConflict" (
  "id" TEXT NOT NULL,
  "orderOptionId" TEXT NOT NULL,
  "requested" INTEGER NOT NULL,
  "refused" INTEGER NOT NULL,
  "deviceId" TEXT,
  "staffName" TEXT,
  "happenedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OptionRedemptionConflict_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OptionRedemptionConflict_orderOptionId_idx" ON "OptionRedemptionConflict"("orderOptionId");
ALTER TABLE "OptionRedemptionConflict" ADD CONSTRAINT "OptionRedemptionConflict_orderOptionId_fkey" FOREIGN KEY ("orderOptionId") REFERENCES "OrderOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
