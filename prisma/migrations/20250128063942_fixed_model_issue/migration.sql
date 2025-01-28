/*
  Warnings:

  - You are about to drop the column `documentId` on the `Link` table. All the data in the column will be lost.
  - You are about to drop the `CrawledDocument` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[crawledDocumentId,url]` on the table `Link` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `crawledDocumentId` to the `Link` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Link" DROP CONSTRAINT "Link_documentId_fkey";

-- DropIndex
DROP INDEX "Link_documentId_url_key";

-- AlterTable
ALTER TABLE "Link" DROP COLUMN "documentId",
ADD COLUMN     "crawledDocumentId" INTEGER NOT NULL;

-- DropTable
DROP TABLE "CrawledDocument";

-- CreateTable
CREATE TABLE "crawledDocument" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "crawlDepth" INTEGER NOT NULL,
    "crawlTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT NOT NULL,

    CONSTRAINT "crawledDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crawledDocument_url_key" ON "crawledDocument"("url");

-- CreateIndex
CREATE UNIQUE INDEX "Link_crawledDocumentId_url_key" ON "Link"("crawledDocumentId", "url");

-- AddForeignKey
ALTER TABLE "Link" ADD CONSTRAINT "Link_crawledDocumentId_fkey" FOREIGN KEY ("crawledDocumentId") REFERENCES "crawledDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
