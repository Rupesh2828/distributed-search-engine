import crypto from "crypto";
import { Request, Response } from "express";
import prisma from "../db/connection";
import {
  processDocument,
  updateContentTsvector,
  getCachedResults,
  cacheSearchResults,
} from "../indexer/indexer";
import { BM25Score } from "../indexer/ranker";
import { urlQueue } from "../crawler/queue/queueManager";

interface DocumentData {
  url: string;
  content: string;
  crawlDepth: number;
  ipAddress: string;
  links: string[];
}

export const storeOrUpdateDocument = async (documentData: DocumentData) => {
  try {
    const { url, content, crawlDepth, ipAddress, links } = documentData;

    if (!url || !content || typeof crawlDepth !== "number" || !ipAddress) {
      throw new Error("Missing or invalid required fields.");
    }

    const contentHash = crypto.createHash("sha256").update(content).digest("hex");

    // Check if the document already exists (Avoid duplicate processing)
    const existingDoc = await prisma.crawledDocument.findUnique({ where: { url } });

    if (existingDoc) {
      console.log(`Exact duplicate detected: ${url}`);
      return { message: "Document already exists", existingDocument: existingDoc };
    }

    // Store new document
    const newDoc = await prisma.crawledDocument.create({
      data: {
        url,
        content,
        contentHash,
        crawlDepth,
        ipAddress,
        links: { create: links.map((link) => ({ url: link })) },
      },
    });

    // Process & Tokenize Stored Document
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

// 🔹 Check if URL is Crawled
export const isUrlCrawled = async (url: string): Promise<boolean> => {
  try {
    const count = await prisma.crawledDocument.count({ where: { url } });
    return count > 0; // Return a boolean value
  } catch (error) {
    console.error(`Error checking if URL is crawled: ${url}`, error);
    throw new Error("Failed to check URL status.");
  }
};


// 🔹 Handle Search Query & Real-Time Crawling
export const searchDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.q as string;
    console.log("search query: ", query);
    
    if (!query || typeof query !== "string") {
      res.status(400).json({ error: "Invalid request. 'query' must be a string." });
      return;
    }

    // Check Cache First
    const cachedResults = await getCachedResults(query);
    if (cachedResults) {
      res.status(200).json({ results: cachedResults });
      return;
    }

     // Fetch the document ID and content from the database based on the query (search term)
     const document = await prisma.crawledDocument.findFirst({
      where: { content: { contains: query } }, // Searching for documents that contain the query
      select: { id: true, content: true },
    });

    if (!document) {
      res.status(404).json({ error: "No document found for the given query." });
      return;
    }
   
    const tokens = await processDocument(document.content, document.id);
    const invertedIndexData = await prisma.invertedIndex.findMany({
      where: { token: { in: tokens } },
    });

    if (invertedIndexData.length > 0) {
      // Rank Results Using BM25
      const docScores: { [docId: number]: number } = {};
      for (const entry of invertedIndexData) {
        const docId = entry.docId;
        docScores[docId] = (docScores[docId] || 0) + (await BM25Score(query, docId));
      }

      const sortedResults = Object.entries(docScores)
        .sort((a, b) => b[1] - a[1])
        .map(([docId]) => Number(docId));

      // Fetch URLs and content of the documents based on sorted results
      const documents = await prisma.crawledDocument.findMany({
        where: { id: { in: sortedResults } },
        select: {
          url: true,
          content: true,
        },
      });

      // Cache the results
      await cacheSearchResults(query, documents);

      res.status(200).json({ results: documents });
    } else {
      // If No Data Exists, Trigger Crawler
      console.log(`No results found. Triggering crawl for: ${query}`);

      const searchURLs = [
        `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`,
        `https://www.reddit.com/search/?q=${encodeURIComponent(query)}`,
      ];

      for (const url of searchURLs) {
        await urlQueue.add("crawlJob", { url, depth: 0 });
      }

      res.status(202).json({ message: "Crawling initiated. Check back soon for results." });
    }
  } catch (error) {
    console.error("Error searching documents:", error);
    res.status(500).json({ error: "Failed to process search query." });
  }
};

//Update an Existing Document
export const updateDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const { document, id } = req.body;
    if (!document || typeof document !== "string" || !id || typeof id !== "number") {
      res.status(400).json({ error: "Invalid request. 'document' must be a string and 'id' must be a number." });
    }

    const tokens = await processDocument(document, id);

    await prisma.documentMetadata.upsert({
      where: { docId: id },
      update: { length: tokens.length },
      create: { docId: id, length: tokens.length },
    });

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

// 🔹 Delete a Document
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
