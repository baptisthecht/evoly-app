-- Compatibilité avec les réseaux de billetterie (docs/COMPATIBILITE_RESEAUX.md) : réseaux, contingents, billets importés
-- CreateEnum
CREATE TYPE "DistributorKind" AS ENUM ('TICKETMASTER', 'FRANCE_BILLET', 'BILLETREDUC', 'PASS_CULTURE', 'TOURIST_OFFICE', 'WORKS_COUNCIL', 'OTHER');

-- CreateEnum
CREATE TYPE "ExternalTicketStatus" AS ENUM ('VALID', 'CANCELLED');

-- AlterEnum
ALTER TYPE "PlanFeature" ADD VALUE IF NOT EXISTS 'DISTRIBUTION';

-- AlterTable
ALTER TABLE "CheckIn" ADD COLUMN     "externalTicketId" TEXT;

-- AlterTable
ALTER TABLE "Seat" ADD COLUMN     "distributorId" TEXT;

-- AlterTable
ALTER TABLE "TicketType" ADD COLUMN     "quantityAllocated" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Distributor" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "DistributorKind" NOT NULL,
    "name" TEXT NOT NULL,
    "importMapping" JSONB,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Distributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributorAllocation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributorAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalTicket" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "ticketTypeId" TEXT,
    "code" TEXT,
    "reservation" TEXT,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "holderName" TEXT,
    "seatLabel" TEXT,
    "seatId" TEXT,
    "priceMinor" INTEGER,
    "status" "ExternalTicketStatus" NOT NULL DEFAULT 'VALID',
    "precreated" BOOLEAN NOT NULL DEFAULT false,
    "checkedInAt" TIMESTAMP(3),
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Distributor_organizationId_name_key" ON "Distributor"("organizationId", "name");

-- CreateIndex
CREATE INDEX "DistributorAllocation_eventId_idx" ON "DistributorAllocation"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "DistributorAllocation_ticketTypeId_distributorId_key" ON "DistributorAllocation"("ticketTypeId", "distributorId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalTicket_seatId_key" ON "ExternalTicket"("seatId");

-- CreateIndex
CREATE INDEX "ExternalTicket_eventId_distributorId_idx" ON "ExternalTicket"("eventId", "distributorId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalTicket_eventId_code_key" ON "ExternalTicket"("eventId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalTicket_eventId_distributorId_reservation_rank_key" ON "ExternalTicket"("eventId", "distributorId", "reservation", "rank");

-- CreateIndex
CREATE INDEX "CheckIn_externalTicketId_idx" ON "CheckIn"("externalTicketId");

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_externalTicketId_fkey" FOREIGN KEY ("externalTicketId") REFERENCES "ExternalTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Distributor" ADD CONSTRAINT "Distributor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributorAllocation" ADD CONSTRAINT "DistributorAllocation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributorAllocation" ADD CONSTRAINT "DistributorAllocation_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributorAllocation" ADD CONSTRAINT "DistributorAllocation_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalTicket" ADD CONSTRAINT "ExternalTicket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalTicket" ADD CONSTRAINT "ExternalTicket_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalTicket" ADD CONSTRAINT "ExternalTicket_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalTicket" ADD CONSTRAINT "ExternalTicket_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

