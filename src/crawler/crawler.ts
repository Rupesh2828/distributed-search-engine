import axios from "axios";
import { Worker } from "bullmq";
import prisma from "../db/connection"
import cheerio from 'cheerio';
import { urlQueue } from "./queue/queueManager";
import { resolveDNS } from "./dnsResolver";


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

//retreving links from html page.

const extractLinks = (html: string, baseUrl: string): string[] => {

    const $ = cheerio.load(html)
    const links: string[] = [];

    $('a').each((_, element) => {
        const href = $(element).attr('href');
        if (href) {
            const absoluteUrl = new URL(href, baseUrl).toString();
            links.push(absoluteUrl);
        }
    });

    return links;
}

//

const worker = new Worker('urlQueue', async job => {


    const { url, depth, strategy } = job.data;
    console.log(`Processing URL: ${url} (Depth: ${depth}, Strategy: ${strategy})`);


    try {

        // Check if the URL has already been crawled
        const existingDocument = await prisma.crawledDocument.findUnique({
            where: { url }
        });
        if (existingDocument) {
            console.log(`URL already crawled: ${url}`);
            return;
        }

        // Fetch the HTML content of the URL
        const response = await axios.get(url);
        const { data: html } = response;

        const links = extractLinks(html, url);

        // Resolve DNS to get IP address for the URL
        const ip = await resolveDNS(url);

        // Store the crawled document in PostgreSQL


        const createdDocument = await prisma.crawledDocument.create({

            data: {
                url,
                content: html,
                crawlDepth: depth,
                ipAddress: ip,
                links: {
                    create: links.map(link => ({ url: link }))
                }
            }
        });

        console.log(`Stored document: ${createdDocument.url}`);

        // Add new links to the queue (DFS/BFS strategy)
        for (const link of links) {
            await urlQueue.add('crawlJob', { url: link, depth: depth + 1, strategy });
        }

    } catch (error) {
        console.error(`Failed to process ${url}:`, error);

    }

})

export { worker, extractLinks };