import axios from "axios";
import { Worker } from "bullmq";
import cheerio from "cheerio";
import { urlQueue } from "./queue/queueManager";
import { resolveDNS } from "./dnsResolver";
import { saveCrawledDocument } from "../controllers/crawler.controller";

// Helper function to fetch HTML content
const fetchHTML = async (url: string): Promise<string> => {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch URL ${url}:`, error);
    throw error;
  }
};

// Retrieving links from an HTML page
const extractLinks = (html: string, baseUrl: string): string[] => {
  const $ = cheerio.load(html);
  const links: string[] = [];

  $("a").each((_, element) => {
    const href = $(element).attr("href");
    if (href) {
      const absoluteUrl = new URL(href, baseUrl).toString();
      links.push(absoluteUrl);
    }
  });

  return links;
};

// Worker for processing the URL
const worker = new Worker("urlQueue", async (job) => {
  const { url, depth, strategy } = job.data;

  console.log(`Processing URL: ${url} (Depth: ${depth}, Strategy: ${strategy})`);

  try {
    // Fetch the HTML content of the URL
    const html = await fetchHTML(url);

    // Extract links from the HTML
    const links = extractLinks(html, url);

    // Resolve DNS to get the IP address for the URL
    const ipAddress = await resolveDNS(url);

    // Save the crawled document in the database
    const createdDocument = await saveCrawledDocument({
      url,
      content: html,
      crawlDepth: depth,
      ipAddress,
      links,
    });

    if (createdDocument) {
      // Add new links to the queue (DFS/BFS strategy)
      for (const link of links) {
        await urlQueue.add("crawlJob", { url: link, depth: depth + 1, strategy });
      }
    }
  } catch (error) {
    console.error(`Failed to process ${url}:`, error);
  }
});

export { worker, extractLinks };
