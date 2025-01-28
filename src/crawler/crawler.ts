import axios from "axios";
import { Worker } from "bullmq";
import  prisma from "../db/connection"
import cheerio from 'cheerio';
import { urlQueue } from "./queue/queueManager";

//retreving links from html page.

const extractLinks = (html:string,baseUrl:string):string[] => {

    const $  = cheerio.load(html)
    const links: string[] = [];

    $('a').each((_, element) => {
        const href = $(element).attr('href');
        if (href) {
            const absoluteUrl = new URL(href,baseUrl).toString();
            links.push(absoluteUrl);
        }
    });

    return links;
}

//

const worker = new Worker('urlQueue', async job => {


     const {url, depth, strategy} = job.data;
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
        
     } catch (error) {
        
     }

})