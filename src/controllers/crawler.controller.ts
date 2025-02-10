import crypto from "crypto";
import { Request, Response } from "express";
import prisma from "../db/connection";
import { 
  processDocument, 
  updateContentTsvector, 
  getCachedResults, 
  cacheSearchResults 
} from "../indexer/indexer";
import { BM25Score } from "../indexer/ranker";

export const storeOrUpdateDocument = async (documentData: any) => {
  try {
    const { url, content, crawlDepth, ipAddress, links } = documentData;

    if (!url || !content || typeof crawlDepth !== "number" || !ipAddress) {
      throw new Error("Missing or invalid required fields.");
    }

    const contentHash = crypto.createHash("sha256").update(content).digest("hex");

    const result = await prisma.$transaction(async (tx) => {
      const existingDoc = await tx.crawledDocument.findUnique({ where: { contentHash } });
      if (existingDoc) {
        console.log(`Exact duplicate detected: ${url}`);
        return { message: "Document already exists", existingDocument: existingDoc };
      }

      return tx.crawledDocument.create({
        data: {
          url,
          content,
          contentHash,
          crawlDepth,
          ipAddress,
          links: { create: links.map((link: string) => ({ url: link })) },
        },
      });
    });

    // If the document already exists, return it immediately
    if ("message" in result) {
      return result;
    }

    // or else process the newly stored document
    const newDoc = result;
    const tokens = await processDocument(newDoc.content, newDoc.id);

    await prisma.documentMetadata.upsert({
      where: { docId: newDoc.id },
      update: { length: tokens.length },
      create: { docId: newDoc.id, length: tokens.length },
    });

    console.log(`Stored document successfully: ${newDoc.url}`);
    return { message: "Document added successfully", storedDoc: newDoc };

  } catch (error) {
    console.error(`Error storing document:`, error);
    throw new Error("Failed to store document.");
  }
};

export const storeCrawledDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const documentData = req.body;
    if (!documentData.url || !documentData.content || typeof documentData.crawlDepth !== "number" || !documentData.ipAddress || !Array.isArray(documentData.links)) {
      res.status(400).json({ error: "Invalid request payload" });
    } 

    const result = await storeOrUpdateDocument(documentData);
    res.status(201).json({ message: "Document stored successfully.", data: result });
  } catch (error) {
    console.error(`Failed to store document for URL ${req.body.url}:`, error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const isUrlCrawled = async (url: string): Promise<boolean> => {
  try {
    const count = await prisma.crawledDocument.count({ where: { url } });
    return count > 0;
  } catch (error) {
    console.error(`Error checking if URL is crawled: ${url}`, error);
    throw new Error("Failed to check URL status.");
  }
};



export const updateDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const { document, id } = req.body;
    if (!document || typeof document !== "string" || !id || typeof id !== "number") {
      res.status(400).json({ error: "Invalid request. 'document' must be a string and 'id' must be a number." });
    }

    const tokens = await processDocument(document, id);
    await prisma.documentMetadata.upsert({ where: { docId: id }, update: { length: tokens.length }, create: { docId: id, length: tokens.length } });
    await prisma.invertedIndex.deleteMany({ where: { docId: id } });
    await prisma.invertedIndex.createMany({
      data: tokens.map((token) => ({ token, docId: id, termFreq: 1 })),
      skipDuplicates: true,
    });
    await updateContentTsvector(document, id);
    res.status(200).json({ message: "Document updated successfully." });
  } catch (error) {
    console.error("Error updating document:", error);
    res.status(500).json({ error: "Failed to update document." });
  }
};

export const deleteDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.body;
    if (!id || typeof id !== "number") {
      res.status(400).json({ error: "Invalid request. 'id' must be a number." });
    }

    await prisma.invertedIndex.deleteMany({ where: { docId: id } });
    await prisma.documentMetadata.delete({ where: { docId: id } });
    await prisma.crawledDocument.delete({ where: { id } });
    res.status(200).json({ message: "Document deleted successfully." });
  } catch (error) {
    console.error("Error deleting document:", error);
    res.status(500).json({ error: "Failed to delete document." });
  }
};

export const searchDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== "string") {
      res.status(400).json({ error: "Invalid request. 'query' must be a string." });
    }

    const cachedResults = await getCachedResults(query);
    if (cachedResults) {
      res.status(200).json({ results: cachedResults });
    }

    const tokens = await processDocument(query, 0);
    const invertedIndexData = await prisma.invertedIndex.findMany({ where: { token: { in: tokens } } });
    const docScores: { [docId: number]: number } = {};
    
    for (const entry of invertedIndexData) {
      const docId = entry.docId;
      if (!docScores[docId]) docScores[docId] = 0;
      docScores[docId] += await BM25Score(query, docId);
    }

    const sortedResults = Object.entries(docScores).sort((a, b) => b[1] - a[1]).map(([docId]) => Number(docId));
    await cacheSearchResults(query, sortedResults);
    res.status(200).json({ results: sortedResults });
  } catch (error) {
    console.error("Error searching documents:", error);
    res.status(500).json({ error: "Failed to search documents." });
  }
};
