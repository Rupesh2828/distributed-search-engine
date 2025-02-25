import crypto from "crypto";
import { Request, Response } from "express";
import prisma from "../db/connection";
import {
  processDocument,
  getCachedResults,
  cacheSearchResults,
} from "../indexer/indexer";
import { BM25Score } from "../indexer/ranker";
import { urlQueue } from "../crawler/queue/queueManager";
import { startCrawling } from "../crawler/crawler";

interface DocumentData {
  url: string;
  content: string;
  crawlDepth: number;
  ipAddress: string;
  links: string[];
}

export const storeDocument = async (documentData: DocumentData) => {
  console.log("storeDocument called with:", documentData);
  try {
    const { url, content, crawlDepth, ipAddress, links } = documentData;

    if (!url || !content || typeof crawlDepth !== "number" || !ipAddress) {
      throw new Error("Missing or invalid required fields.");
    }

    const existingDoc = await prisma.crawledDocument.findUnique({ where: { url } });
    if (existingDoc) {
      console.log(`Exact duplicate detected: ${url}`);
      return { message: "Document already exists", existingDocument: existingDoc };
    }

    // Store new document only if fetched by the crawler
    const contentHash = crypto.createHash("sha256").update(content).digest("hex");
    console.log(`Attempting to store document for: ${url}`);

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
    return count > 0;
  } catch (error) {
    console.error(`Error checking if URL is crawled: ${url}`, error);
    throw new Error("Failed to check URL status.");
  }
};

export const searchDocuments = async (req: Request, res: Response): Promise<void> => {
   try {
    const  query  = req.query.q as string;
    if (!query || typeof query !== "string") {
       res.status(400).json({ error: "Query is required" });
    }

    console.log(`User searched: ${query}`);

    // Step 1: Check Cache
    const cachedResults = await getCachedResults(query);
    if (cachedResults) {
      console.log("Returning cached results");
       res.json({ results: cachedResults });
    }

    // Step 2: Search in Database
    const existingResults = await prisma.crawledDocument.findMany({
      where: {
        content: {
          contains: query, // Search in stored documents
        },
      },
    });

    if (existingResults.length > 0) {
      console.log("Returning results from DB");
      await cacheSearchResults(query, existingResults); // Cache results
       res.json({ results: existingResults });
    }

    // Step 3: If not found, trigger the Crawler
    console.log("No results found. Triggering crawler...");
    
    const crawlResults = await startCrawling(query); // Crawler fetches data
    if (!Array.isArray(crawlResults)) {
      throw new Error("Crawler did not return an array of results.");
    }

    // Step 4: Store New Crawled Data
    if (crawlResults && crawlResults.length > 0) {
      const storedDocs: { url: string; content: string }[] = [];

      for (const doc of crawlResults) {
        const storedDoc = await storeDocument(doc); // Store each document
        if (storedDoc.storedDoc) {
          storedDocs.push({ url: storedDoc.storedDoc.url, content: storedDoc.storedDoc.content });
        }
      }

      await cacheSearchResults(query, storedDocs); // Cache new results
       res.json({ results: storedDocs });
    }

     res.json({ results: [], message: "No relevant pages found." });
     
  } catch (error) {
    console.error("Error in search API:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};



// 🔹 Delete a Document
export const deleteDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.body;
    if (!id || typeof id !== "number") {
      res.status(400).json({ error: "Invalid request. 'id' must be a number." });
      return;
    }

    await prisma.crawledDocument.delete({ where: { id } });
    res.status(200).json({ message: "Document deleted successfully." });
  } catch (error) {
    console.error("Error deleting document:", error);
    res.status(500).json({ error: "Failed to delete document." });
  }
};