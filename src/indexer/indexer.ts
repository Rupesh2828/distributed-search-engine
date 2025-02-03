// indexer.ts
import { BM25Score } from './ranker';
import processText from './tokenizer';
import { createClient } from 'redis';
import prisma from '../db/connection';
import { Queue } from 'bullmq';
import { urlQueue } from '../crawler/queue/queueManager';

const redis = createClient({ url: 'redis://localhost:6379' });

redis.on('error', (err) => {
  console.error('Redis Client Error', err);
});

async function connectRedis() {
  try {
    await redis.connect();
  } catch (error) {
    console.error('Error connecting to Redis:', error);
  }
}

connectRedis(); 


export const invertedIndex: { [key: string]: { [docId: number]: number } } = {};
export const docLengths: { [docId: number]: number } = {};
export let totalDocs: number = 0;

export function processDocument(document: string): string[] {
  return processText(document);  // Tokenizes the document
}

export async function updateContentTsvector(document: string, id: number): Promise<void> {
  try {
    // Use the Prisma `update` method with the SQL function `to_tsvector` for full-text search
    await prisma.crawledDocument.update({
      where: { id },
      data: {
        content_tsvector: {
          // Directly pass the SQL function to update the tsvector field
          set: (await prisma.$queryRaw<{ to_tsvector: string }[]>`SELECT to_tsvector(${document})`)[0].to_tsvector, // Use the raw SQL function to update the tsvector field
        },
      },
    });
  } catch (error) {
    console.error('Error updating content_tsvector:', error);
    throw new Error('Failed to update content_tsvector');
  }
}

export function calculateBM25(query: string, docId: number, invertedIndexData: any[]): number {
  let score = 0;
  invertedIndexData.forEach((entry) => {
    const docScore = BM25Score(query, docId);
    score += docScore;
  });
  return score;
}

export async function getCachedResults(query: string): Promise<number[] | null> {
  const cachedResults = await redis.get(`search:${query}`);
  return cachedResults ? JSON.parse(cachedResults) : null;
}

export async function cacheSearchResults(query: string, results: number[]): Promise<void> {
  await redis.set(`search:${query}`, JSON.stringify(results), { EX: 3600 }); // Cache for 1 hour
}

export async function enqueueIndexingTask(document: string, id: number): Promise<void> {
  try {
    await urlQueue.add('indexDocument', { document, id });
  } catch (error) {
    console.error('Error adding indexing task to queue:', error);
  }
}
