-- Options achetées sans billet : vestiaire seul… (RG-OPT-03)
ALTER TABLE "EventOption" ADD COLUMN "standalone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "optionsCode" TEXT;
ALTER TABLE "Order" ADD COLUMN "optionsShortCode" TEXT;
CREATE UNIQUE INDEX "Order_optionsCode_key" ON "Order"("optionsCode");
CREATE UNIQUE INDEX "Order_optionsShortCode_key" ON "Order"("optionsShortCode");
