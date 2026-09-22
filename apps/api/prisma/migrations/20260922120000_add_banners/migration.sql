-- CreateTable
CREATE TABLE "banners" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "subtitle" VARCHAR(160),
    "image" TEXT NOT NULL,
    "link" VARCHAR(500) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "banners_enabled_sortOrder_idx" ON "banners"("enabled", "sortOrder");
