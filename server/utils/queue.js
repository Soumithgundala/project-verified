import IORedis from 'ioredis';
import { Queue } from 'bullmq';

const redisUrl = process.env.REDIS_URL || null;
const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = Number(process.env.REDIS_PORT || 6379);

const connection = redisUrl
  ? new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true
    })
  : new IORedis({
      host: redisHost,
      port: redisPort,
      maxRetriesPerRequest: null,
      lazyConnect: true
    });

export const documentQueueName = process.env.DOCUMENT_QUEUE_NAME || 'document-vectorization';

export const plagiarismQueue = new Queue(documentQueueName, {
  connection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false
  }
});

export async function enqueueDocumentVectorization(data) {
  const jobId = data.documentId;
  return plagiarismQueue.add('extract-vectors', data, {
    jobId,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  });
}
