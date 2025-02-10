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

//automate indexing when a document is added/updated
export async function processDocument(document: string, id: number): Promise<string[]> {  
  try {
    let retries = 5;
    let existingDocument = null;

    while (retries > 0) {
      existingDocument = await prisma.crawledDocument.findUnique({
        where: { id },
      });

      if (existingDocument) break; 
      console.log(`⚠️ Document with id ${id} not found. Retrying in 500ms...`);
      await new Promise((resolve) => setTimeout(resolve, 500));
      retries--;
    }

    if (!existingDocument) {
      throw new Error(`Document with id ${id} still not found in CrawledDocument.`);
    }

    const tokens = processText(document);
    const docLength = tokens.length;

    await prisma.$transaction(async (tx) => {
      await tx.documentMetadata.upsert({
        where: { docId: id },
        update: { length: docLength },
        create: { docId: id, length: docLength },
      });

      await tx.invertedIndex.deleteMany({ where: { docId: id } });

      await Promise.all(
        tokens.map((token) =>
          tx.invertedIndex.upsert({
            where: { token_docId: { token, docId: id } },
            update: { termFreq: { increment: 1 } },
            create: { token, docId: id, termFreq: 1 },
          })
        )
      );
    });

    await updateContentTsvector(document, id);

    return tokens;
  } catch (error) {
    console.error("Error processing document:", error);
    throw new Error("Error processing and indexing document.");
  }
}


// 🔹 Automate content update for full-text search
export async function updateContentTsvector(document: string, id: number): Promise<void> {
  try {
    await prisma.crawledDocument.update({
      where: { id },
      data: {
        content_tsvector: {
          set: (
            await prisma.$queryRaw<{ to_tsvector: string }[]>`
              SELECT to_tsvector(${document})
            `
          )[0].to_tsvector,
        },
      },
    });
  } catch (error) {
    console.error("Error updating content_tsvector:", error);
  }
}

// 🔹 Calculate BM25 score
export async function calculateBM25(query: string, docId: number): Promise<number> {
  return BM25Score(query, docId);
}

// 🔹 Caching
export async function getCachedResults(query: string): Promise<number[] | null> {
  await connectRedis();
  const cachedResults = await redis.get(`search:${query}`);
  return cachedResults ? JSON.parse(cachedResults) : null;
}

export async function cacheSearchResults(query: string, results: number[]): Promise<void> {
  await connectRedis();
  await redis.set(`search:${query}`, JSON.stringify(results), { EX: 3600 });
}

// 🔹 Automate indexing by enqueueing a task
export async function enqueueIndexingTask(document: string, id: number): Promise<void> {
  try {
    await urlQueue.add("indexDocument", { document, id });
  } catch (error) {
    console.error("Error adding indexing task to queue:", error);
  }
}
