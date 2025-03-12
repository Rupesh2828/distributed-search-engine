import { BM25Score } from "./ranker";
import processText from "./tokenizer";
import { createClient } from "redis";
import prisma from "../db/connection";
import { urlQueue } from "../crawler/queue/queueManager";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const redis = createClient({ url: REDIS_URL });

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
export async function processDocument(document: any, id: number): Promise<string[]> {
  try {
    if (id <= 0) {
      console.error(`Invalid document ID received: ${id}`);
      throw new Error(`Invalid document ID: ${id}`);
    }

    // Fetch the document if not provided with content
    let documentContent: string;
    let existingDocument = null;
    
    if (typeof document === 'string') {
      documentContent = document;
      
      // Fetch the document to ensure it exists
      existingDocument = await prisma.crawledDocument.findUnique({
        where: { id },
      });
      
      if (!existingDocument) {
        throw new Error(`Document with id ${id} not found.`);
      }
    } else if (document.content) {
      documentContent = document.content;
      existingDocument = document;
    } else {
      // Retry logic for fetching the existing document
      let retries = 5;
      let delay = 500;
      
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
      
      documentContent = existingDocument.content;
    }

    // Process text to get tokens
    const tokens = processText(documentContent);
    const docLength = tokens.length;

    // Create a frequency map for tokens
    const tokenFrequency = new Map<string, number>();
    for (const token of tokens) {
      tokenFrequency.set(token, (tokenFrequency.get(token) ?? 0) + 1);
    }

    // Use transaction for atomic operations
    await prisma.$transaction(async (tx) => {
      // Update document metadata
      await tx.documentMetadata.upsert({
        where: { docId: id },
        update: { length: docLength },
        create: { docId: id, length: docLength },
      });

      // Delete existing inverted index entries for this document
      await tx.invertedIndex.deleteMany({ where: { docId: id } });

      // Create batch of inverted index entries
      const invertedIndexData = Array.from(tokenFrequency.entries()).map(([token, freq]) => ({
        token,
        docId: id,
        termFreq: freq
      }));

      // Batch create the inverted index entries (more efficient)
      if (invertedIndexData.length > 0) {
        await tx.invertedIndex.createMany({
          data: invertedIndexData,
          skipDuplicates: true
        });
      }

      // Mark document as processed
      await tx.crawledDocument.update({
        where: { id },
        data: { processed: true }
      });
    });

    // Update the content tsvector for full-text search
    await updateContentTsvector(documentContent, id);

    return tokens;
  } catch (error) {
    console.error("Error processing document:", error);
    throw new Error("Error processing and indexing document.");
  }
}

export async function updateContentTsvector(document: string, id: number): Promise<void> {
  try {
    const docExists = await prisma.crawledDocument.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!docExists) {
      console.error(`Document with id ${id} not found for tsvector update.`);
      return;
    }

    await prisma.$executeRaw`
      UPDATE "CrawledDocument"
      SET content_tsvector = to_tsvector('english', content || ' ' || COALESCE(title, ''))
      WHERE id = ${id};
    `;
    
    console.log(`Successfully updated tsvector for document ${id}`);
  } catch (error) {
    console.error("Error updating content_tsvector:", error);
  }
}

// Search using fulltext search with BM25 ranking
export async function searchDocuments(query: string, limit = 20): Promise<any[]> {
  try {
    // Check cache first
    const cachedResults = await getCachedResults(query);
    if (cachedResults) {
      console.log("Returning cached search results");
      return cachedResults;
    }
    
    // Process the query to get tokens
    const queryTokens = processText(query);
    
    if (queryTokens.length === 0) {
      return [];
    }
    
    // First attempt: Use PostgreSQL full-text search for speed
    const tsQuery = queryTokens.join(' & ');
    const fullTextResults = await prisma.$queryRaw`
      SELECT id, url, title, content, ts_rank(content_tsvector, to_tsquery(${tsQuery})) as rank
      FROM "CrawledDocument"
      WHERE content_tsvector @@ to_tsquery(${tsQuery})
      ORDER BY rank DESC
      LIMIT ${limit};
    `;
    
    if (Array.isArray(fullTextResults) && fullTextResults.length > 0) {
      // Cache and return results
      await cacheSearchResults(query, fullTextResults);
      return fullTextResults;
    }
    
    // Fallback: Use BM25 for more precise results if full-text search returns nothing
    // This would require retrieving documents that contain ANY of the query tokens
    const documentIds = await prisma.invertedIndex.findMany({
      where: {
        token: {
          in: queryTokens
        }
      },
      select: {
        docId: true
      },
      distinct: ['docId']
    });
    
    const uniqueDocIds = [...new Set(documentIds.map(item => item.docId))];
    
    // Score each document using BM25
    const scoredResults = await Promise.all(
      uniqueDocIds.map(async (docId) => {
        const score = await BM25Score(query, docId);
        const document = await prisma.crawledDocument.findUnique({
          where: { id: docId },
          select: { id: true, url: true, title: true, content: true }
        });
        return { ...document, rank: score };
      })
    );
    
    // Sort by score and limit
    const results = scoredResults
      .sort((a, b) => b.rank - a.rank)
      .slice(0, limit);
    
    // Cache results
    await cacheSearchResults(query, results);
    
    return results;
  } catch (error) {
    console.error("Error searching documents:", error);
    return [];
  }
}

// Calculate BM25 score for relevance ranking
export async function calculateBM25(query: string, docId: number): Promise<number> {
  return BM25Score(query, docId);
}

// Caching: Get cached results for a query
export async function getCachedResults(query: string): Promise<any[] | null> {
  await connectRedis();
  const cachedResults = await redis.get(`search:${query}`);
  return cachedResults ? JSON.parse(cachedResults) : null;
}

// Cache search results for a query
export async function cacheSearchResults(query: string, results: any[]): Promise<void> {
  await connectRedis();
  const cacheTTL = 3600; // 1 hour
  await redis.set(`search:${query}`, JSON.stringify(results), { EX: cacheTTL });
}

// Automate indexing by enqueueing a task for document processing
export async function enqueueIndexingTask(document: string, id: number): Promise<void> {
  try {
    const existingTask = await urlQueue.getJob(`index:${id}`);
    if (existingTask) {
      console.log(`Document with id ${id} is already in the indexing queue.`);
      return;
    }
    await urlQueue.add("indexDocument", { document, id }, { 
      jobId: `index:${id}`,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      }
    });
    
    console.log(`Enqueued indexing task for document ${id}`);
  } catch (error) {
    console.error("Error adding indexing task to queue:", error);
  }
}

// Bulk reindex documents (useful for schema changes or algorithm updates)
export async function reindexAllDocuments(batchSize = 100): Promise<void> {
  let skip = 0;
  let hasMore = true;
  
  try {
    while (hasMore) {
      const documents = await prisma.crawledDocument.findMany({
        take: batchSize,
        skip,
        select: { id: true }
      });
      
      if (documents.length === 0) {
        hasMore = false;
        break;
      }
      
      // Enqueue all documents for reindexing
      for (const doc of documents) {
        await enqueueIndexingTask("", doc.id);
      }
      
      skip += batchSize;
    }
    
    console.log("All documents queued for reindexing");
  } catch (error) {
    console.error("Error reindexing documents:", error);
  }
}