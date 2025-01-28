/*
  Warnings:

  - You are about to drop the `crawledDocument` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Link" DROP CONSTRAINT "Link_crawledDocumentId_fkey";

-- DropTable
DROP TABLE "crawledDocument";

-- CreateTable
CREATE TABLE "CrawledDocument" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "crawlDepth" INTEGER NOT NULL,
    "crawlTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT NOT NULL,

    CONSTRAINT "CrawledDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrawledDocument_url_key" ON "CrawledDocument"("url");

-- AddForeignKey
ALTER TABLE "Link" ADD CONSTRAINT "Link_crawledDocumentId_fkey" FOREIGN KEY ("crawledDocumentId") REFERENCES "CrawledDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
