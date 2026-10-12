-- Ambassadeurs (section 9.28, Pro) : liens de vente suivis et classement
CREATE TABLE "Ambassador" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "code" TEXT NOT NULL,
    "statsToken" TEXT NOT NULL,
    "goal" INTEGER,
    "reward" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Ambassador_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Ambassador_goal_pos" CHECK ("goal" IS NULL OR "goal" >= 1)
);
CREATE UNIQUE INDEX "Ambassador_statsToken_key" ON "Ambassador"("statsToken");
CREATE UNIQUE INDEX "Ambassador_eventId_code_key" ON "Ambassador"("eventId", "code");
ALTER TABLE "Ambassador" ADD CONSTRAINT "Ambassador_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD COLUMN "ambassadorId" TEXT;
CREATE INDEX "Order_ambassadorId_idx" ON "Order"("ambassadorId");
ALTER TABLE "Order" ADD CONSTRAINT "Order_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "Ambassador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
