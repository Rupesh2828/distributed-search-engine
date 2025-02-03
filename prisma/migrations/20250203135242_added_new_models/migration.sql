-- AlterTable
ALTER TABLE "CrawledDocument" ADD COLUMN     "content_tsvector" TEXT;

-- CreateTable
CREATE TABLE "InvertedIndex" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "docId" INTEGER NOT NULL,
    "termFreq" INTEGER NOT NULL,

    CONSTRAINT "InvertedIndex_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentMetadata" (
    "id" SERIAL NOT NULL,
    "docId" INTEGER NOT NULL,
    "length" INTEGER NOT NULL,

    CONSTRAINT "DocumentMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvertedIndex_token_docId_key" ON "InvertedIndex"("token", "docId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentMetadata_docId_key" ON "DocumentMetadata"("docId");

-- AddForeignKey
ALTER TABLE "InvertedIndex" ADD CONSTRAINT "InvertedIndex_docId_fkey" FOREIGN KEY ("docId") REFERENCES "CrawledDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentMetadata" ADD CONSTRAINT "DocumentMetadata_docId_fkey" FOREIGN KEY ("docId") REFERENCES "CrawledDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
