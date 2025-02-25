import { BM25Score } from "./ranker";
import processText from "./tokenizer";
import { createClient } from "redis";
import prisma from "../db/connection";
import { urlQueue } from "../crawler/queue/queueManager";

const redis = createClient({ url: "redis://localhost:6379" });

redis.on("error", (err) => console.error("Redis Client Error", err));

async function connectRedis() {
  try {
    if (!redis.isOpen) {
      await redis.connect();
    }
  } catch (error) {
    console.error("Error connecting to Redis:", error);
  }
}

connectRedis();

// Automate indexing when a document is added/updated
export async function processDocument(document: string, id: number): Promise<string[]> {
  try {
    if (id <= 0) {
      console.error(`Invalid document ID received: ${id}`); // Log the invalid ID
      throw new Error(`Invalid document ID: ${id}`);
    }

    let retries = 5;
    let delay = 500;
    let existingDocument = null;

    // Retry logic for fetching the existing document
    while (retries > 0) {
      existingDocument = await prisma.crawledDocument.findUnique({
        where: { id },
      });

      if (existingDocument) break;

      console.log(`Document with id ${id} not found. Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      retries--;
      delay *= 2;  // Exponential backoff
    }

    if (!existingDocument) {
      throw new Error(`Document with id ${id} still not found after ${5 - retries} retries.`);
    }

    const tokens = processText(document);
    const docLength = tokens.length;

    // Use transaction for atomic operations
    await prisma.$transaction(async (tx) => {
      // Update document metadata
      await tx.documentMetadata.upsert({
        where: { docId: id },
        update: { length: docLength },
        create: { docId: id, length: docLength },
      });

      // Delete existing inverted index entries
      await tx.invertedIndex.deleteMany({ where: { docId: id } });

      // Insert new inverted index entries
      const invertedIndexPromises = tokens.map((token) =>
        tx.invertedIndex.upsert({
          where: { token_docId: { token, docId: id } },
          update: { termFreq: { increment: 1 } },
          create: { token, docId: id, termFreq: 1 },
        })
      );

      await Promise.all(invertedIndexPromises);
    });

    // Update the content tsvector for full-text search
    await updateContentTsvector(document, id);

    return tokens;
  } catch (error) {
    console.error("Error processing document:", error);
    throw new Error("Error processing and indexing document.");
  }
}

// Automate content update for full-text search
export async function updateContentTsvector(document: string, id: number): Promise<void> {
  try {
    // Execute raw query to get the tsvector
    const result = await prisma.$queryRaw<{ to_tsvector: string }[]>`
      SELECT to_tsvector(${document})
    `;

    // Extract the to_tsvector value from the first row of the result
    const toTsvector = result[0]?.to_tsvector;

    if (toTsvector) {
      await prisma.crawledDocument.update({
        where: { id },
        data: {
          content_tsvector: toTsvector,
        },
      });
    } else {
      console.error("Failed to generate tsvector for the document.");
    }
  } catch (error) {
    console.error("Error updating content_tsvector:", error);
  }
}

// Calculate BM25 score for relevance ranking
export async function calculateBM25(query: string, docId: number): Promise<number> {
  return BM25Score(query, docId);
}

// Caching: Get cached results for a query
export async function getCachedResults(query: string): Promise<number[] | null> {
  await connectRedis();
  const cachedResults = await redis.get(`search:${query}`);
  return cachedResults ? JSON.parse(cachedResults) : null;
}

// Cache search results for a query
export async function cacheSearchResults(query: string, results: { url: string; content: string }[]): Promise<void> {
  await connectRedis();
  const cacheTTL = 3600; // 1 hour
  await redis.set(`search:${query}`, JSON.stringify(results), { EX: cacheTTL });
}

// Automate indexing by enqueueing a task for document processing
export async function enqueueIndexingTask(document: string, id: number): Promise<void> {
  try {
    const existingTask = await urlQueue.getJob(id.toString());
    if (existingTask) {
      console.log(`Document with id ${id} is already in the queue.`);
      return;
    }
    await urlQueue.add("indexDocument", { document, id });
  } catch (error) {
    console.error("Error adding indexing task to queue:", error);
  }
}
