/*
  Warnings:

  - A unique constraint covering the columns `[crawledDocumentId]` on the table `Link` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Link_crawledDocumentId_key" ON "Link"("crawledDocumentId");
