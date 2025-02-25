import axios from "axios";
import * as cheerio from "cheerio";
import { urlQueue } from "./queue/queueManager";
import prisma from "../db/connection";

interface DocumentData {
  url: string;
  content: string;
  crawlDepth: number;
  ipAddress: string;
  links: string[];
}

const MAX_DEPTH = 2;

export const startCrawling = async (searchQuery: string): Promise<DocumentData[]> => {
  console.log("Starting crawler...");

  const seedUrls = ["https://google.com", "https://www.bbc.com", "https://www.cnn.com"];
  const crawledDocuments: DocumentData[] = [];
  
  try {
    for (const url of seedUrls) {
      const crawlResult = await urlQueue.add("crawlJob", { url, depth: 0 });
      if (crawlResult) {
        const documentData = await processCrawlJob(crawlResult);
        if (documentData) {
          crawledDocuments.push(documentData);
        }
      }
    }
    
    return crawledDocuments; // Return the array of crawled documents
  } catch (error) {
    console.error("Error initializing crawler:", (error as Error).message);
    return []; // Return an empty array in case of failure
  }
};


export const processCrawlJob = async (job: any): Promise<DocumentData | null> => {
  const { url, depth } = job.data;
  if (depth > MAX_DEPTH) return null;

  console.log(`Crawling: ${url} (Depth: ${depth})`);

  try {
    // Modify this to check for an existing document by `url` instead of depth
    const existingDocument = await prisma.crawledDocument.findUnique({ where: { url } });
    if (existingDocument) {
      console.log(`Already stored: ${url}`);
      return null; // No need to reprocess
    }

    const response = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(response.data);
    const content = $("body").text().trim().slice(0, 1000);
    const links: string[] = [];

    $("a").each((_, element) => {
      const href = $(element).attr("href");
      if (href && href.startsWith("http")) {
        links.push(href);
      }
    });

    const newDoc = {
      url,
      content,
      crawlDepth: depth,
      ipAddress: response.request.socket.remoteAddress,
      links,
    };

    await prisma.crawledDocument.create({
      data: {
        url,
        content,
        crawlDepth: depth,
        ipAddress: response.request.socket.remoteAddress,
        links: { create: links.map((link) => ({ url: link })) },
      },
    });

    console.log(`Stored: ${url}`);

    if (depth + 1 <= MAX_DEPTH) {
      for (const link of links) {
        await urlQueue.add("crawlJob", { url: link, depth: depth + 1 });
      }
    }

    return newDoc; // Return the processed document
  } catch (error) {
    console.error(`Error crawling ${url}:`, (error as Error).message);
    return null; // In case of error, return null
  }
};


