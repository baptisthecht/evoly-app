-- Tables et forfaits (section 9.31) : plusieurs billets par achat, noms de tables, consommations comprises
ALTER TABLE "TicketType" ADD COLUMN "groupSize" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "TicketType" ADD COLUMN "tableLabels" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_groupSize_range" CHECK ("groupSize" BETWEEN 1 AND 30);
ALTER TABLE "Ticket" ADD COLUMN "tableLabel" TEXT;
CREATE TABLE "IncludedOption" (
    "id" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "IncludedOption_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "IncludedOption_quantity_pos" CHECK ("quantity" BETWEEN 1 AND 100)
);
CREATE UNIQUE INDEX "IncludedOption_ticketTypeId_optionId_key" ON "IncludedOption"("ticketTypeId", "optionId");
ALTER TABLE "IncludedOption" ADD CONSTRAINT "IncludedOption_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncludedOption" ADD CONSTRAINT "IncludedOption_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "EventOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
