import cron from "node-cron";
import { urlQueue } from "./queue/queueManager";
import prisma from "../db/connection";

// Function to schedule automatic crawling
export const scheduleCrawl = () => {
  cron.schedule("*/30 * * * *", async () => {
    console.log("🚀 Starting automated crawling...");

    try {
      // Fetch uncrawled URLs from the database
      const uncrawledUrls = await prisma.crawledDocument.findMany({
        where: { processed: false },
        select: { id: true, url: true },
        take: 10, // Adjust batch size
      });

      if (uncrawledUrls.length === 0) {
        console.log("✅ No new URLs to crawl.");
        return;
      }

      // Process uncrawled URLs concurrently with async promises
      const crawlPromises = uncrawledUrls.map(async ({ id, url }) => {
        try {
          await urlQueue.add("crawlJob", { url, depth: 1, strategy: "BFS" });
          console.log(`🕷️ Scheduled URL for crawling: ${url}`);

          // Mark the URL as `processed: true` immediately to prevent duplicate scheduling
          await prisma.crawledDocument.update({
            where: { id },
            data: { processed: true },
          });
        } catch (error) {
          console.error(`❌ Error processing URL ${url}:`, error);
          // Optional: You could add retry logic here for failed URLs
        }
      });

      await Promise.all(crawlPromises);
    } catch (error) {
      console.error("❌ Error scheduling crawling:", error);
    }
  });

  console.log("⏳ Crawler scheduler started.");
};
