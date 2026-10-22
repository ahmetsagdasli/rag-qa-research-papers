// server/src/rate-limiter.js
// IP başına dakikalık istek limiti. REDIS_URL set edilmişse sayaç Redis'te tutulur
// (çoklu instance'lar arasında paylaşılır); yoksa tek instance için in-memory fallback kullanılır.

const redis = require("./redis");

const WINDOW_MS = 60_000;
const WINDOW_SECONDS = 60;
const LIMIT = Number(process.env.RATE_LIMIT_PER_MINUTE || 120);

const memoryBuckets = new Map();

function checkMemory(key) {
  const now = Date.now();
  const bucket = (memoryBuckets.get(key) || []).filter((time) => now - time < WINDOW_MS);
  const allowed = bucket.length < LIMIT;
  if (allowed) bucket.push(now);
  memoryBuckets.set(key, bucket);
  return allowed;
}

async function checkRedis(key) {
  const connection = redis.getConnection();
  const redisKey = `ratelimit:${key}`;
  const count = await connection.incr(redisKey);
  if (count === 1) await connection.expire(redisKey, WINDOW_SECONDS);
  return count <= LIMIT;
}

function middleware() {
  return async (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    try {
      const allowed = redis.enabled() ? await checkRedis(key) : checkMemory(key);
      if (!allowed) return res.status(429).json({ ok: false, error: "Too many requests. Try again in a minute." });
      return next();
    } catch (error) {
      console.error("rate limiter error (failing open):", error.message);
      return next();
    }
  };
}

module.exports = { middleware };
