import { Request, Response } from "express";
import prisma from "../db/connection";
import { processDocument, updateContentTsvector } from "../indexer/indexer";

// Save or update a crawled document in the database
export const storeOrUpdateDocument = async (documentData: any) => {
  try {
    return await prisma.$transaction(async (tx) => {
      // Destructure fields from documentData
      const { url, content, crawlDepth, ipAddress, links } = documentData;

      // Check if the document already exists
      const existingDocument = await tx.$queryRaw`
  SELECT * FROM "public"."CrawledDocument"
  WHERE "content_tsvector" @@ plainto_tsquery(${content})
  LIMIT 1;
`;


      if (existingDocument) {
        console.log(`Duplicate document detected: ${url}`);
        return { message: "Document already exists", existingDocument };
      }

      // Insert new crawled document
      const newDoc = await tx.crawledDocument.create({
        data: {
          url,
          content,
          crawlDepth,
          ipAddress,
          links: { create: links.map((link: string) => ({ url: link })) },
        },
      });

      const docId = newDoc.id;
      const tokens = await processDocument(content, docId);
      const docLength = tokens.length;

      // Update document metadata
      await tx.documentMetadata.upsert({
        where: { docId },
        update: { length: docLength },
        create: { docId, length: docLength },
      });

      // Batch insert/update for inverted index
      await tx.invertedIndex.createMany({
        data: tokens.map((token) => ({ token, docId, termFreq: 1 })),
        skipDuplicates: true, // Avoid duplicate keys
      });

      // Update full-text search vector
      await updateContentTsvector(content, docId);

      console.log(`Stored document successfully: ${newDoc.url}`);
      return { message: "Document added successfully", storedDoc: newDoc };
    });
  } catch (error) {
    console.error(`Error storing document: ${documentData.url}`, error);
    throw new Error("Failed to store document.");
  }
};

// Store the crawled document in the database
export const storeCrawledDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const documentData = req.body;

    // Validate the request body
    if (!documentData.url || !documentData.content || typeof documentData.crawlDepth !== "number" || !documentData.ipAddress || !Array.isArray(documentData.links)) {
      res.status(400).json({ error: "Invalid request payload" });
    }

    const result = await storeOrUpdateDocument(documentData);

    if (result.message === "Document already exists") {
      res.status(200).json({ message: `URL already crawled: ${documentData.url}` });
    }

    res.status(201).json({ message: "Document stored successfully.", data: result });
  } catch (error) {
    console.error(`Failed to store document for URL ${req.body.url}:`, error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Check if a URL has already been crawled
export const isUrlCrawled = async (url: string): Promise<boolean> => {
  try {
    const count = await prisma.crawledDocument.count({ where: { url } });
    return count > 0;
  } catch (error) {
    console.error(`Error checking if URL is crawled: ${url}`, error);
    throw new Error("Failed to check URL status.");
  }
};
