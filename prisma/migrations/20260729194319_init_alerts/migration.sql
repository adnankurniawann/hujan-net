-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "catchmentId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "windowKey" TEXT NOT NULL,
    "raisedAtSec" INTEGER NOT NULL,
    "raisedAtWall" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accumMm" REAL NOT NULL,
    "thresholdMm" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'menunggu',
    "decidedBy" TEXT,
    "decidedAt" DATETIME,
    "note" TEXT
);

-- CreateIndex
CREATE INDEX "Alert_status_idx" ON "Alert"("status");

-- CreateIndex
CREATE INDEX "Alert_catchmentId_idx" ON "Alert"("catchmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_eventId_catchmentId_level_raisedAtSec_key" ON "Alert"("eventId", "catchmentId", "level", "raisedAtSec");
