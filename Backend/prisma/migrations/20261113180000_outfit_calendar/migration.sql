-- OUTFIT CALENDAR: qué outfit te pones cada día.

-- CreateEnum
CREATE TYPE "CalendarEventKind" AS ENUM ('BIRTHDAY', 'PARTY', 'WEDDING', 'DATE', 'INTERVIEW', 'TRIP', 'CONCERT', 'OTHER');

-- CreateTable
CREATE TABLE "CalendarEntry" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "outfitId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "note" VARCHAR(500),
    "eventName" VARCHAR(80),
    "eventKind" "CalendarEventKind",
    "wornAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEntry_userId_date_idx" ON "CalendarEntry"("userId", "date");

-- CreateIndex
CREATE INDEX "CalendarEntry_outfitId_date_idx" ON "CalendarEntry"("outfitId", "date");

-- AddForeignKey
ALTER TABLE "CalendarEntry" ADD CONSTRAINT "CalendarEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEntry" ADD CONSTRAINT "CalendarEntry_outfitId_userId_fkey" FOREIGN KEY ("outfitId", "userId") REFERENCES "Outfit"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
