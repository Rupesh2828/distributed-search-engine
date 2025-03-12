import { Queue, QueueEvents, Worker } from 'bullmq';
import { createClient } from 'redis';
import { processCrawlJob } from "../crawler";

// Configuration (ideally from environment variables)
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const QUEUE_NAME = 'urlQueue';
const CONCURRENCY = parseInt(process.env.CRAWLER_CONCURRENCY || '5', 10);

// Redis connection configuration
const redisOptions = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
};

// Create queue instance with appropriate settings
export const urlQueue = new Queue(QUEUE_NAME, {
  connection: redisOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 1000,  // Keep the last 1000 completed jobs
    removeOnFail: 5000,      // Keep the last 5000 failed jobs
  }
});

// Create queue events for monitoring
export const queueEvents = new QueueEvents(QUEUE_NAME, { connection: redisOptions });

// Create worker to process jobs
export const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    console.log(`Processing job ${job.id}: ${job.data.url}`);
    return processCrawlJob(job);
  },
  {
    connection: redisOptions,
    concurrency: CONCURRENCY,
    limiter: {
      max: 100,        // Max 100 jobs
      duration: 60000, // Per minute
    },
  }
);

// Event listeners for better monitoring and logging
worker.on('completed', (job) => {
  console.log(`Job ${job?.id} completed for ${job?.data.url}`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed for ${job?.data.url}: ${err.message}`);
});

queueEvents.on('waiting', ({ jobId }) => {
  console.log(`Job ${jobId} is waiting`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down queue manager...');
  await worker.close();
  await urlQueue.close();
  process.exit(0);
});

// Initialize
(async () => {
  try {
    console.log(`Queue manager initialized with concurrency ${CONCURRENCY}`);
    // Clean old jobs on startup
    await urlQueue.obliterate({ force: true });
    console.log('Queue cleaned');
  } catch (error) {
    console.error('Error initializing queue manager:', error);
    process.exit(1);
  }
})();