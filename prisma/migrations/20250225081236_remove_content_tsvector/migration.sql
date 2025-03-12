/*
  Warnings:

  - You are about to drop the column `content_tsvector` on the `CrawledDocument` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Link_crawledDocumentId_key";

-- AlterTable
ALTER TABLE "CrawledDocument" DROP COLUMN "content_tsvector";
