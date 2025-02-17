import axios from "axios";
import { Worker } from "bullmq";
import cheerio from "cheerio";
import { urlQueue } from "./queue/queueManager";
import { resolveDNS } from "./dnsResolver";
import { storeOrUpdateDocument, isUrlCrawled } from "../controllers/crawler.controller";
import { scheduleCrawl } from "./scheduler";
import { computeUrlPriority } from "../utils/priority";
import { BloomFilterCache } from "../utils/filter";

const MAX_DEPTH = 3; // Prevent infinite crawling
const CRAWL_DELAY_MS = 5000; // Politeness delay (5 sec)
const MAX_RETRIES = 3; // Retry on failure
const SEED_URLS = ["https://example.com", "https://another-site.com"];

// 🔹 Helper function to fetch HTML content with retries
const fetchHTML = async (url: string, retries = MAX_RETRIES): Promise<string> => {
  try {
    const response = await axios.get(url, { timeout: 10000 });
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

// 🔹 Extract links and return an array (does NOT queue URLs here)
const extractLinks = async (html: string, baseUrl: string): Promise<{ url: string; priority: number }[]> => {
  const $ = cheerio.load(html);
  const linksWithPriority: { url: string; priority: number }[] = [];

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

  //for higher priority
  return linksWithPriority.sort((a, b) => b.priority - a.priority);
};

// 🔹 Worker for processing URLs
const worker = new Worker("urlQueue", async (job) => {
  const { url, depth } = job.data;

  if (depth > MAX_DEPTH) return; 
  console.log(`Processing URL: ${url} (Depth: ${depth})`);

  try {
    if (await isUrlCrawled(url) || BloomFilterCache.has(url)) {
      console.log(`Skipping already crawled URL: ${url}`);
      return;
    }

    // 🔹 Fetch HTML content
    const html = await fetchHTML(url);
    if (!html) return;

    //extract and prioritize links
    const links = await extractLinks(html, url);

    const ipAddress = await resolveDNS(url);

    const createdDocument = await storeOrUpdateDocument({
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

//enqueues initial seed URLs
const enqueueSeedUrls = async () => {
  for (const url of SEED_URLS) {
    const priority = computeUrlPriority(url);
    await urlQueue.add("crawlJob", { url, depth: 0 }, { priority });
  }
};

const startCrawling = async () => {
  console.log("Starting automated crawler...");
  await enqueueSeedUrls();
  scheduleCrawl(); 
};

startCrawling();

export { worker, extractLinks };
