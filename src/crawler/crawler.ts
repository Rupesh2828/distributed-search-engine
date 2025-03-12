import axios from "axios";
import * as cheerio from "cheerio";
import robotsParser from "robots-parser";
import { urlQueue } from "./queue/queueManager";
import prisma from "../db/connection";
import { createHash } from "crypto";

interface DocumentData {
  url: string;
  content: string;
  crawlDepth: number;
  ipAddress: string;
  links: string[];
}

const MAX_DEPTH = 2;
const MAX_LINKS = 10;
const USER_AGENT = "YourCrawlerBot"; // Change this to your bot name

//robots.txt compliance
const checkRobotsTxt = async (url: string): Promise<boolean> => {
  try {
    const { origin } = new URL(url);
    const robotsUrl = `${origin}/robots.txt`;

    const response = await axios.get(robotsUrl, { timeout: 3000 });

    const robots = robotsParser(robotsUrl, response.data);
    return robots.isAllowed(url, USER_AGENT) ?? true;
  } catch (error) {
    console.log(`No robots.txt found for ${url}, proceeding...`);
    return true; 
  }
};

export const startCrawling = async (searchQuery: string): Promise<DocumentData[]> => {
  console.log("Starting crawler for query:", searchQuery);

  const seedUrls = [
    "https://www.google.com",
    "https://www.wikipedia.org"
  ];

  const filteredUrls = seedUrls.filter(url =>
    url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const urlsToUse = filteredUrls.length > 0 ? filteredUrls : seedUrls;

  const crawledDocuments: DocumentData[] = [];

  try {
    for (const url of urlsToUse) {
      await urlQueue.add("crawlJob", { url, depth: 0, searchQuery });
    }

    await new Promise(resolve => setTimeout(resolve, 30000));

    const results = await prisma.crawledDocument.findMany({
      where: { content: { contains: searchQuery } },
      orderBy: { crawlDepth: "asc" },
      take: 20,
    });

    return results.map(doc => ({
      url: doc.url,
      content: doc.content,
      crawlDepth: doc.crawlDepth,
      ipAddress: doc.ipAddress || "unknown",
      links: []
    }));
  } catch (error) {
    console.error("Error in crawler:", (error as Error).message);
    return [];
  }
};

export const processCrawlJob = async (job: any): Promise<DocumentData | null> => {
  const { url, depth, searchQuery } = job.data;

  if (depth > MAX_DEPTH) {
    console.log(`Skipping ${url} as it exceeds max depth of ${MAX_DEPTH}`);
    return null;
  }

  // Check robots.txt before crawling
  const isAllowed = await checkRobotsTxt(url);
  if (!isAllowed) {
    console.log(`Blocked by robots.txt: ${url}`);
    return null;
  }

  console.log(`Crawling: ${url} (Depth: ${depth})`);

  try {
    const response = await axios.get(url, {
      timeout: 1000,
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.google.com"
      }
    });

    const $ = cheerio.load(response.data);
    const title = $("title").text().trim();
    const content = $("body").text().trim().slice(0, 10000);

    if (!searchQuery || !content.toLowerCase().includes(searchQuery.toLowerCase())) {
      console.log(`Skipping irrelevant content: ${url}`);
      return null;
    }

    const links: string[] = [];
    $("a").each((_, element) => {
      const href = $(element).attr("href");
      if (href && href.startsWith("https")) {
        links.push(href);
      }
    });

    const ipAddress = response.request.socket.remoteAddress || "unknown";

    const contentHash = createHash("sha256").update(content).digest("hex");

    const existingDocument = await prisma.crawledDocument.findUnique({
      where: { contentHash }
    });

    if (existingDocument) {
      console.log("Content with this hash already exists.");
      return null;
    }

    await prisma.crawledDocument.upsert({
      where: { url },
      update: {},
      create: {
        url,
        content,
        contentHash,
        crawlDepth: depth,
        ipAddress,
        links: { create: links.map(link => ({ url: link })) },
      },
    });

    console.log(`Stored: ${url}`);

    const linksToProcess = links.slice(0, MAX_LINKS);
    for (const link of linksToProcess) {
      if (link.toLowerCase().includes(searchQuery.toLowerCase())) {
        await urlQueue.add("crawlJob", { url: link, depth: depth + 1, searchQuery }, { delay: 1000 });
      }
    }

    return { url, content, crawlDepth: depth, ipAddress, links };
  } catch (error) {
    console.error(`Error crawling ${url}:`, (error as Error).message);
    return null;
  }
};
