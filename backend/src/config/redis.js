const redis = require('redis');
const logger = require('../utils/logger');

let redisClient;

async function connectRedis() {
  redisClient = redis.createClient({
    socket: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
    },
    password: process.env.REDIS_PASSWORD,
  });

  redisClient.on('error', (err) => {
    logger.error('Erreur Redis:', err);
  });

  redisClient.on('connect', () => {
    logger.info('Connexion Redis établie');
  });

  await redisClient.connect();
  return redisClient;
}

function getRedisClient() {
  if (!redisClient) {
    throw new Error('Redis client non initialisé');
  }
  return redisClient;
}

module.exports = { connectRedis, getRedisClient };