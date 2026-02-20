import redis from "./redis";

const WINDOW_SECONDS = 60 * 15; // 15 Minutes
const MAX_ATTEMPTS = 5; // 5 Attempts per window

/**
 * Sliding Window Rate Limiter (Approximation using Redis EXPIRE).
 * @param identifier IP Address or Email
 * @param action "login", "register", etc.
 */
export async function rateLimit(
    identifier: string,
    action: string = "default",
    limit: number = MAX_ATTEMPTS,
    windowSeconds: number = WINDOW_SECONDS,
) {
    const key = `ratelimit:${action}:${identifier}`;

    // Atomic increment and expire:
    // If key doesn't exist, INCR sets it to 1.
    // If result is 1, we set EXPIRE.
    // This ensures we never have a key without an expiry (unless Redis crashes between instructions, but Lua makes it atomic).
    const result = await redis.eval(
        `
        local current = redis.call("INCR", KEYS[1])
        if current == 1 then
            redis.call("EXPIRE", KEYS[1], ARGV[1])
        end
        return current
        `,
        1,
        key,
        windowSeconds,
    );

    const current = typeof result === "number" ? result : 1;

    // Get TTL to calculate reset time accurately
    const ttl = await redis.ttl(key);

    return {
        success: current <= limit,
        limit,
        remaining: Math.max(0, limit - current),
        reset: Date.now() + (ttl > 0 ? ttl * 1000 : windowSeconds * 1000),
    };
}
