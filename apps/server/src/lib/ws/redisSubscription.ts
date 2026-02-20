import { Redis } from "ioredis";
import { EventEmitter } from "events";
import config from "../../config";

/**
 * Singleton Manager for Redis Subscriptions.
 * Ensures we only have ONE connection to Redis for all WebSocket clients.
 * Uses reference counting to manage active subscriptions.
 */
class RedisSubscriptionManager extends EventEmitter {
    private redis: Redis;

    constructor() {
        super();
        this.redis = new Redis(config.redis.url);

        // Max listeners warning is annoying when we have many channels
        // But here `this` is the emitter. We emit events per channel.
        this.setMaxListeners(0); // Unlimited

        this.redis.on("message", (channel, message) => {
            try {
                // Emit to internal listeners (VideoRouter will listen to this)
                this.emit(channel, JSON.parse(message));
            } catch (e) {
                console.error(
                    `[RedisSub] Failed to parse message on ${channel}`,
                    e,
                );
            }
        });

        this.redis.on("connect", () => {
            console.log("[RedisSub] ✅ Connected to Redis for Subscriptions");
        });

        this.redis.on("error", (err) => {
            console.error("[RedisSub] ❌ Connection Error:", err);
        });

        // --- Auto-Manage Redis Subscriptions ---

        this.on("newListener", (event: string) => {
            if (event === "newListener" || event === "removeListener") return;

            // 'newListener' fires BEFORE the listener is added.
            // If count is 0, this is the first listener.
            if (this.listenerCount(event) === 0) {
                this.redis.subscribe(event).catch((err) => {
                    console.error(
                        `[RedisSub] Failed to subscribe to ${event}`,
                        err,
                    );
                });
                console.log(
                    `[RedisSub] 🔌 Subscribing to Redis channel: ${event}`,
                );
            }
        });

        this.on("removeListener", (event: string) => {
            if (event === "newListener" || event === "removeListener") return;

            // 'removeListener' fires AFTER the listener is removed.
            // If count is 0, we have no more listeners.
            if (this.listenerCount(event) === 0) {
                this.redis.unsubscribe(event).catch((err) => {
                    console.error(
                        `[RedisSub] Failed to unsubscribe from ${event}`,
                        err,
                    );
                });
                console.log(
                    `[RedisSub] 🔌 Unsubscribing from Redis channel: ${event}`,
                );
            }
        });
    }

    public async quit() {
        await this.redis.quit();
    }
}

export const redisSubscriptionManager = new RedisSubscriptionManager();
