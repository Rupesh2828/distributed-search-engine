import axios from "axios";
import { Worker } from "bullmq";
import cheerio from "cheerio";
import { urlQueue } from "./queue/queueManager";
import { resolveDNS } from "./dnsResolver";
import { storeDocument, isUrlCrawled } from "../controllers/crawler.controller";
import { scheduleCrawl } from "./scheduler";
import { computeUrlPriority } from "../utils/priority";
import { BloomFilterCache } from "../utils/filter";

interface SearchApiResponse {
  results: { url: string }[]; // Adjust this based on the actual response structure
}

const MAX_DEPTH = 3; // Prevent infinite crawling
const CRAWL_DELAY_MS = 5000; // Politeness delay (5 sec)
const MAX_RETRIES = 3; // Retry on failure

// 🔹 Helper function to fetch HTML content with retries
const fetchHTML = async (url: string, retries = MAX_RETRIES): Promise<string> => {
  try {
    console.log(`Crawler is making a request to: ${url}`);
    const response = await axios.get(url, { timeout: 10000 });
    console.log(`Successfully fetched data from: ${url}`);

    return response.data;
  } catch (error) {

    if (retries > 0) {
      console.warn(`Retrying (${MAX_RETRIES - retries + 1}) - Failed to fetch: ${url}`);
      return fetchHTML(url, retries - 1);
    }
    console.error(`Failed to fetch URL ${url}:`, error);
    return "";
  }
};

// Extract links and return an array (does NOT queue URLs here)
const extractLinks = async (html: string, baseUrl: string): Promise<{ url: string; priority: number }[]> => {
  const $ = cheerio.load(html);
  const linksWithPriority: { url: string; priority: number }[] = [];

  try {
    const jsonResponse: SearchApiResponse = JSON.parse(html); // Try parsing the response as JSON
    if (jsonResponse.results) {
      // If it's JSON and contains 'results', process those links
      jsonResponse.results.forEach((result) => {
        try {
          const absoluteUrl = new URL(result.url, baseUrl).toString();
          const priority = computeUrlPriority(absoluteUrl);
          linksWithPriority.push({ url: absoluteUrl, priority });
        } catch (error) {
          console.warn(`Skipping malformed URL: ${result.url}`);
        }
      });
      return linksWithPriority.sort((a, b) => b.priority - a.priority);
    }
  } catch (error) {
    // If it's not JSON, fallback to parsing HTML with cheerio
    $("a").each((_, element) => {
      const href = $(element).attr("href");
      if (href) {
        try {
          const absoluteUrl = new URL(href, baseUrl).toString();
          const priority = computeUrlPriority(absoluteUrl);
          linksWithPriority.push({ url: absoluteUrl, priority });
        } catch (error) {
          console.warn(`Skipping malformed URL: ${href}`);
        }
      }
    });
  }

  // For higher priority
  return linksWithPriority.sort((a, b) => b.priority - a.priority);
};

//Worker for processing URLs
const worker = new Worker("urlQueue", async (job) => {
  console.log(`Worker received job: ${job.id}`);
  const { url, depth } = job.data;
  console.log("Worker processing job:", job.data.url);

  if (depth > MAX_DEPTH) return;
  console.log(`Processing URL: ${url} (Depth: ${depth})`);

  try {
    if (await isUrlCrawled(url) || BloomFilterCache.has(url)) {
      console.log(`Skipping already crawled URL: ${url}`);
      return;
    }

    // 🔹 Fetch HTML content
    const html = await fetchHTML(url);
    console.log("Fetched HTML for URL:", url);
    if (!html) return;

    // Extract and prioritize links
    const links = await extractLinks(html, url);
    console.log("Extracted links:", links);

    const ipAddress = await resolveDNS(url);

    const createdDocument = await storeDocument({
      url,
      content: html,
      crawlDepth: depth,
      ipAddress,
      links: links.map(linkObj => linkObj.url),
    });

    if (createdDocument) {
      BloomFilterCache.add(url);
      for (const { url: link, priority } of links) {
        await urlQueue.add(
          "crawlJob",
          { url: link, depth: depth + 1 },
          { delay: CRAWL_DELAY_MS, priority }
        );
      }
    }
  } catch (error) {
    console.error(`Failed to process ${url}:`, error);
  }
});

// Enqueues initial seed URLs
const enqueueSeedUrls = async () => {
  const starterSites = [
    "https://www.wikipedia.org/",
    "https://www.bbc.com/",
    "https://edition.cnn.com/"
  ];

  for (const url of starterSites) {
    const priority = computeUrlPriority(url);
    await urlQueue.add("crawlJob", { url, depth: 0 }, { priority });
    console.log(`Added URL to queue: ${url}`);
  }
};

const startCrawling = async () => {
  console.log("Starting automated crawler...");
  await enqueueSeedUrls();
  scheduleCrawl();
};

startCrawling();

export { worker, extractLinks };