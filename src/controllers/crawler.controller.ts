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
  console.log("storeDocument called with:", documentData.url);
  try {
    const { url, content, crawlDepth, ipAddress, links } = documentData;

    if (!url || !content || typeof crawlDepth !== "number" || !ipAddress) {
      throw new Error("Missing or invalid required fields.");
    }

    const contentHash = crypto.createHash("sha256").update(content).digest("hex");
    
    // Check if document with this URL or content hash already exists
    const existingDoc = await prisma.crawledDocument.findFirst({
      where: {
        OR: [
          { url },
          { contentHash }
        ]
      }
    });

    if (existingDoc) {
      console.log(`Duplicate detected: ${url}`);
      return { message: "Document already exists", existingDocument: existingDoc };
    }

    // Create document with normalized links
    const newDoc = await prisma.crawledDocument.create({
      data: {
        url,
        content,
        contentHash,
        crawlDepth,
        ipAddress,
        links: { 
          create: links
            .slice(0, 10)  // Limit to 10 links
            .map((link) => ({ url: link })) 
        },
      },
    });

    console.log(`Stored document successfully: ${newDoc.url}`);
    return { message: "Document added successfully", storedDoc: newDoc };
  } catch (error) {
    console.error(`Error storing document:`, error);
    throw new Error(`Failed to store document: ${(error as Error).message}`);
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

    // Check cache first
    const cachedResults = await getCachedResults(query);
    if (cachedResults && cachedResults.length > 0) {
      console.log(`Returning ${cachedResults.length} cached results for: ${query}`);
      res.json({ results: cachedResults });
      return;
    }

    // Then check database
    const existingResults = await prisma.crawledDocument.findMany({
      where: {
        content: {
          contains: query,
          mode: 'insensitive'  // Case-insensitive search
        },
      },
      take: 20,  // Limit results
      orderBy: {
        crawlDepth: 'asc'  // Lower depth (more relevant) first
      }
    });

    console.log(`Found ${existingResults.length} documents in DB for: ${query}`);
    if (existingResults.length > 0) {
      console.log("Returning results from DB");
      await cacheSearchResults(query, existingResults); // Cache results
      res.json({ results: existingResults });
      return;
    }

    // If no results, trigger crawler
    console.log(`No results found for "${query}". Triggering crawler...`);
    const crawlResults = await startCrawling(query); // Crawler fetches data
    
    if (!Array.isArray(crawlResults)) {
      throw new Error("Crawler did not return an array of results.");
    }

    console.log(`Crawler returned ${crawlResults.length} results for: ${query}`);
    if (crawlResults.length > 0) {
      // Format results for response
      const formattedResults = crawlResults.map(doc => ({
        url: doc.url,
        content: doc.content.substring(0, 200) + '...',  // Truncate content for display
        fullContent: doc.content,
        crawlDepth: doc.crawlDepth
      }));
      
      await cacheSearchResults(query, formattedResults); 
      res.json({ results: formattedResults });
      return;
    }

    // If still no results, return empty array
    console.log(`No results found for "${query}" after crawling`);
    res.json({ 
      results: [], 
      message: "No relevant pages found. Please try a different search query." 
    });
  } catch (error) {
    console.error("Error in search API:", error);
    res.status(500).json({ 
      error: "Internal Server Error",
      message: (error as Error).message 
    });
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