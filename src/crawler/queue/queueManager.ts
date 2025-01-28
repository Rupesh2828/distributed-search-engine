// queueManager.ts
import { Queue, QueueEvents } from 'bullmq';
import { createClient } from 'redis';

// Create the Redis client
const redisClient = createClient({ url: 'redis://localhost:6379' });

(async () => {
  try {
    // Connect to Redis
    await redisClient.connect();
    console.log('Connected to Redis');
  } catch (error) {
    console.error('Error connecting to Redis:', error);
    process.exit(1); // Exit the process if Redis connection fails
  }
})();

// Queue creation: Only pass the connection URL or object
export const urlQueue = new Queue('urlQueue', {
  connection: {
    host: 'localhost',
    port: 6379,
  },
});

// Events for urlQueue
try {
  new QueueEvents('urlQueue', { connection: { host: 'localhost', port: 6379 } });
  console.log('QueueEvents for urlQueue initialized');
} catch (error) {
  console.error('Error initializing QueueEvents:', error);
}
