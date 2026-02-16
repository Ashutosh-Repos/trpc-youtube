import { Redis } from "ioredis";

const globalForRedis = global as unknown as { redis: Redis; redisUrl: string };

export const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const createRedisClient = () => {
    // Obfuscate sensitive part for logging
    const logUrl = redisUrl.replace(/\/\/.*@/, "//***:***@");
    console.log(`[Redis] Initializing client with: ${logUrl}`);

    return new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
            if (times > 3) {
                console.error("[Redis] Connection failed after 3 retries");
                return null;
            }
            return Math.min(times * 50, 2000);
        },
        connectTimeout: 5000,
        // Only use TLS if protocol is rediss://
        tls: redisUrl.startsWith("rediss")
            ? { rejectUnauthorized: false }
            : undefined,
    });
};

const redis =
    process.env.NODE_ENV === "production"
        ? createRedisClient()
        : (() => {
              if (
                  !globalForRedis.redis ||
                  globalForRedis.redisUrl !== redisUrl
              ) {
                  if (globalForRedis.redis) {
                      console.log(
                          "[Redis] URL changed or HMR trigger, disconnecting old client...",
                      );
                      globalForRedis.redis.disconnect();
                  }
                  globalForRedis.redis = createRedisClient();
                  globalForRedis.redisUrl = redisUrl;
              }
              return globalForRedis.redis;
          })();

export function getRedisConnection() {
    const urlStr = redisUrl || "redis://localhost:6379";

    // If it doesn't start with redis://, assume host:port or just host
    if (!urlStr.startsWith("redis://") && !urlStr.startsWith("rediss://")) {
        const [host, port] = urlStr.split(":");
        return {
            host: host || "localhost",
            port: parseInt(port || "6379"),
        };
    }

    try {
        const url = new URL(urlStr);
        return {
            host: url.hostname,
            port: parseInt(url.port || "6379"),
            username: url.username,
            password: url.password,
        };
    } catch (e) {
        console.warn("Invalid Redis URL, falling back to localhost", e);
        return { host: "localhost", port: 6379 };
    }
}

export default redis;
