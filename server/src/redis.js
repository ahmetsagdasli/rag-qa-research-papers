// server/src/redis.js
// Tüm modüllerin paylaştığı tek Redis bağlantısı (job queue + rate limiter).
// REDIS_URL yoksa devre dışı; çağıranlar kendi in-memory fallback'ine döner.

const IORedis = require("ioredis");

let connection;

function enabled() {
  return Boolean(process.env.REDIS_URL);
}

function getConnection() {
  if (!enabled()) return null;
  if (!connection) connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  return connection;
}

module.exports = { enabled, getConnection };
