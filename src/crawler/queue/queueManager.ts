import {Queue, QueueScheduler} from 'bullmq';
import {createClient} from 'redis'; 

//redis
const redisClient = createClient({ url: 'redis://localhost:6379' });

(async () => {
    try {
        await redisClient.connect();
        console.log('Connected to Redis');
    } catch (error) {
        console.error('Error connecting to Redis:', error);
        process.exit(1); // Exit the process if Redis connection fails
    }
})();

//URL queue for managing crawling jobs

export const urlQueue = new Queue('urlQueue', {
    connection: {
        client: redisClient,
    },
});


//Scheduler for urlQueue
try {
    new QueueScheduler('urlQueue', { connection: { client: redisClient } });
    console.log('QueueScheduler for urlQueue initialized');
} catch (error) {
    console.error('Error initializing QueueScheduler:', error);
}

