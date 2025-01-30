import { Request, Response } from "express";
import prisma from "../db/connection";

// Function to save crawled document in the database (reusable)
export const saveCrawledDocument = async ({
  url,
  content,
  crawlDepth,
  ipAddress,
  links,
}: {
  url: string;
  content: string;
  crawlDepth: number;
  ipAddress: string;
  links: string[];
}) => {
  try {
    const existingDocument = await prisma.crawledDocument.findFirst({
      where: {
        content: {
          search: content,
        },
      },
      orderBy: {
        // Prisma will automatically rank results by relevance
        content: 'asc',
      },
    });

    if (existingDocument) {
      console.log(`URL already crawled: ${url}`);
      return null;
    }

    const createdDocument = await prisma.crawledDocument.create({
      data: {
        url,
        content,
        crawlDepth,
        ipAddress,
        links: {
          create: links.map((link) => ({ url: link })),
        },
      },
    });

    console.log(`Stored document: ${createdDocument.url}`);
    return createdDocument;
  } catch (error) {
    console.error(`Failed to store document for URL ${url}:`, error);
    throw error;
  }
};

// store the crawled document in the database
export const storeCrawledDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const { url, content, crawlDepth, ipAddress, links } = req.body;

    // Validate the request body
    if (!url || !content || typeof crawlDepth !== "number" || !ipAddress || !Array.isArray(links)) {
      res.status(400).json({ error: "Invalid request payload" });
      return;
    }

    const createdDocument = await saveCrawledDocument({
      url,
      content,
      crawlDepth,
      ipAddress,
      links,
    });

    if (!createdDocument) {
      res.status(200).json({ message: `URL already crawled: ${url}` });
      return;
    }

    res.status(201).json({ message: "Document stored successfully.", data: createdDocument });
  } catch (error) {
    console.error(`Failed to store document for URL ${req.body.url}:`, error);
    res.status(500).json({ error: "Internal server error" });
  }
};
