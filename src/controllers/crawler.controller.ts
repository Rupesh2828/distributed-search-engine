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

interface DocumentData {
  url: string;
  content: string;
  crawlDepth: number;
  ipAddress: string;
  links: string[];
}

export const storeDocument = async (documentData: DocumentData) => {
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
    console.log("Query: ", query);
    
    if (cachedResults) {
      res.status(200).json({ results: cachedResults });
      return;
    }

    // Fetch documents based on query
    const documents = await prisma.crawledDocument.findMany({
      where: { content: { contains: query } },
      select: { url: true, content: true },
    });
    console.log("Fetched Documents:", documents);

    if (documents.length > 0) {
      // Cache results
      await cacheSearchResults(query, documents);
      res.status(200).json({ results: documents });
    } else {
      console.log(`No results found. Triggering crawl for: ${query}`);
      
      const searchURLs = [
        `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`,
        `https://www.reddit.com/search/?q=${encodeURIComponent(query)}`,
      ];

      for (const url of searchURLs) {
        console.log("Job added to queue:", url);
        await urlQueue.add("crawlJob", { url, depth: 0 });
      }

      res.status(202).json({ message: "Crawling initiated. Check back soon for results." });
    }
  } catch (error) {
    console.error("Error searching documents:", error);
    res.status(500).json({ error: "Failed to process search query." });
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