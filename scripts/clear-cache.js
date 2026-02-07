import { redis } from '../config/redis.js';

async function clearCache() {
  if (!redis) {
    console.error('Redis not configured, or connection failed');
    process.exit(1);
  }

  try {
    await redis.flushdb();
    
    console.log('Succesfully deleted cache');
  } catch (error) {
    console.error('Error deleting cache:', error);
    process.exit(1);
  }
}

clearCache();
