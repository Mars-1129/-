import { Module, Global } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { QUEUE_CONSTANTS } from './queue.constants';

function createRedisConnection(): Redis {
  return new Redis({
    host: QUEUE_CONSTANTS.REDIS_HOST,
    port: QUEUE_CONSTANTS.REDIS_PORT,
    password: QUEUE_CONSTANTS.REDIS_PASSWORD,
    db: QUEUE_CONSTANTS.REDIS_DB,
    maxRetriesPerRequest: null,
    connectTimeout: 5000,
    retryStrategy: (times: number) => {
      if (times > 5) {
        return null;
      }
      return Math.min(times * 1000, 5000);
    },
  });
}

function defaultJobOptions() {
  return {
    attempts: QUEUE_CONSTANTS.JOB_ATTEMPTS,
    backoff: {
      type: 'exponential' as const,
      delay: QUEUE_CONSTANTS.JOB_BACKOFF_DELAY_MS,
    },
    removeOnComplete: { age: QUEUE_CONSTANTS.JOB_REMOVE_ON_COMPLETE_AGE_SECONDS },
    removeOnFail: { age: QUEUE_CONSTANTS.JOB_REMOVE_ON_FAIL_AGE_SECONDS },
  };
}

const gpuSlicingQueueProvider = {
  provide: 'GPU_SLICING_QUEUE',
  useFactory: (): Queue => {
    return new Queue(QUEUE_CONSTANTS.GPU_SLICING_QUEUE, {
      connection: createRedisConnection(),
      defaultJobOptions: defaultJobOptions(),
    });
  },
};

const creationQueueProvider = {
  provide: 'CREATION_QUEUE',
  useFactory: (): Queue => {
    return new Queue(QUEUE_CONSTANTS.CREATION_QUEUE, {
      connection: createRedisConnection(),
      defaultJobOptions: defaultJobOptions(),
    });
  },
};

const autocutQueueProvider = {
  provide: 'AUTOCUT_QUEUE',
  useFactory: (): Queue => {
    return new Queue(QUEUE_CONSTANTS.AUTOCUT_QUEUE, {
      connection: createRedisConnection(),
      defaultJobOptions: defaultJobOptions(),
    });
  },
};

@Global()
@Module({
  providers: [gpuSlicingQueueProvider, creationQueueProvider, autocutQueueProvider],
  exports: [gpuSlicingQueueProvider, creationQueueProvider, autocutQueueProvider],
})
export class BullMQModule {}
