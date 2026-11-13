-- CreateTable
CREATE TABLE "DailyActive" (
    "day" DATE NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "DailyActive_pkey" PRIMARY KEY ("day","userId")
);

-- CreateIndex
CREATE INDEX "DailyActive_userId_idx" ON "DailyActive"("userId");

-- AddForeignKey
ALTER TABLE "DailyActive" ADD CONSTRAINT "DailyActive_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
