import { Queue, QueueEvents } from 'bullmq';
import { createClient } from 'redis';

const redisUrl = 'redis://127.0.0.1:6379';

const redisClient = createClient({ url: redisUrl });

(async () => {
  try {
    await redisClient.connect();
    console.log('Connected to Redis');
  } catch (error) {
    console.error('Error connecting to Redis:', error);
    process.exit(1);
  }
})();


const redisConnection = {
  host: '127.0.0.1',
  port: 6379,
};

export const urlQueue = new Queue('urlQueue', { connection: redisConnection });


try {
  new QueueEvents('urlQueue', { connection: redisConnection });
  console.log('QueueEvents for urlQueue initialized');
} catch (error) {
  console.error('Error initializing QueueEvents:', error);
}
