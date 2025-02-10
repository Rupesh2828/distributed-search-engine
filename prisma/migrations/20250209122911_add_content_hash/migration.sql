/*
  Warnings:

  - A unique constraint covering the columns `[contentHash]` on the table `CrawledDocument` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "CrawledDocument" ADD COLUMN     "contentHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CrawledDocument_contentHash_key" ON "CrawledDocument"("contentHash");
