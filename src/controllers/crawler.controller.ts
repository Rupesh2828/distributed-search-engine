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

    const contentHash = crypto.createHash("sha256").update(content).digest("hex");
    const existingDoc = await prisma.crawledDocument.findUnique({ where: { url } });

    if (existingDoc) {
      console.log(`Exact duplicate detected: ${url}`);
      return { message: "Document already exists", existingDocument: existingDoc };
    }

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

export const searchDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.q as string;
    if (!query || typeof query !== "string") {
      res.status(400).json({ error: "Query is required" });
      return;
    }

    console.log(`User searched: ${query}`);

    const cachedResults = await getCachedResults(query);
    if (cachedResults) {
      console.log("Returning cached results:", cachedResults);
      res.json({ results: cachedResults });
      return;
    }

    const existingResults = await prisma.crawledDocument.findMany({
      where: {
        content: {
          contains: query,
        },
      },
    });

    console.log("Found documents in DB:", existingResults);
    if (existingResults.length > 0) {
      console.log("Returning results from DB");
      await cacheSearchResults(query, existingResults); // Cache results
      res.json({ results: existingResults });
      return;
    }

    console.log("No results found. Triggering crawler...");
    const crawlResults = await startCrawling(query); // Crawler fetches data
    if (!Array.isArray(crawlResults)) {
      throw new Error("Crawler did not return an array of results.");
    }

    console.log("Crawl results:", crawlResults);
    if (crawlResults && crawlResults.length > 0) {
      const storedDocs: { url: string; content: string }[] = [];
      for (const doc of crawlResults) {
        const exists = await isUrlCrawled(doc.url); 
        if (!exists) {
          const storedDoc = await storeDocument(doc); 
          if (storedDoc.storedDoc) {
            storedDocs.push({ url: storedDoc.storedDoc.url, content: storedDoc.storedDoc.content });
          }
        } else {
          const existingDoc = await prisma.crawledDocument.findUnique({ where: { url: doc.url } });
          if (existingDoc) {
            storedDocs.push({ url: existingDoc.url, content: existingDoc.content });
          }
        }
      }
      await cacheSearchResults(query, storedDocs); 
      res.json({ results: storedDocs });
      return;
    }

    res.json({ results: [], message: "No relevant pages found." });
  } catch (error) {
    console.error("Error in search API:", error);
    res.status(500).json({ error: "Internal Server Error" });
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
