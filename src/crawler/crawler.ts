import axios from "axios";
import { Worker } from "bullmq";
import cheerio from "cheerio";
import { urlQueue } from "./queue/queueManager";
import { resolveDNS } from "./dnsResolver";
import { saveCrawledDocument, isUrlCrawled } from "../controllers/crawler.controller";
import { scheduleCrawl } from "./scheduler";

const MAX_DEPTH = 3; // Prevent infinite crawling
const CRAWL_DELAY_MS = 5000; // Politeness delay (5 sec)
const SEED_URLS = ["https://example.com", "https://another-site.com"];


// Helper function to fetch HTML content
const fetchHTML = async (url: string): Promise<string> => {
  try {
    const response = await axios.get(url,{ timeout: 10000 });
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch URL ${url}:`, error);
    return "";
  }
};

// Retrieving links from an HTML page
const extractLinks = (html: string, baseUrl: string): string[] => {
  const $ = cheerio.load(html);
  const links: string[] = [];

  $("a").each((_, element) => {
    const href = $(element).attr("href");
    if (href) {
      try {
        const absoluteUrl = new URL(href, baseUrl).toString();
        links.push(absoluteUrl);
      } catch (error) {
        console.warn(`Skipping malformed URL: ${href}`);
        
      }
    }
  });

  return links;
};

// Worker for processing the URL
const worker = new Worker("urlQueue", async (job) => {
  const { url, depth } = job.data;

  //stop crawling at max depth
  if (depth > MAX_DEPTH) return;

  console.log(`Processing URL: ${url} (Depth: ${depth}`);

  try {

    // Check if URL is already crawled to prevent duplication
    if (await isUrlCrawled(url)) {
      console.log(`Skipping already crawled URL: ${url}`);
      return;
    }

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
        await urlQueue.add("crawlJob", { url: link, depth: depth + 1 },{ delay: CRAWL_DELAY_MS });
      }
    }
  } catch (error) {
    console.error(`Failed to process ${url}:`, error);
  }
});

// Function to enqueue initial seed URLs
const enqueueSeedUrls = async () => {
  for (const url of SEED_URLS) {
    await urlQueue.add("crawlJob", { url, depth: 0 });
  }
};

// Start the automated crawling process
const startCrawling = async () => {
  console.log("Starting automated crawler...");
  await enqueueSeedUrls();
  scheduleCrawl(); // Automate periodic crawling
};

startCrawling();

export { worker, extractLinks };
