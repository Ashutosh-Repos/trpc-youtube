import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "./prisma";
import redis from "./redis";

/**
 * Server-side Better Auth configuration
 *
 * Purpose: Session validation ONLY
 * - Validates session cookies from incoming tRPC requests
 * - Reads session data from Redis (secondaryStorage) or the shared database
 *
 * Note: Login, registration, OAuth, password reset all happen
 * on the client (Next.js app). This server only validates.
 */

// Redis adapter matching the client's secondaryStorage implementation
const redisSecondaryStorage = {
    async get(key: string) {
        const value = await redis.get(key);
        return value ? value : null;
    },
    async set(key: string, value: string, ttl?: number) {
        if (ttl) {
            await redis.set(key, value, "EX", ttl);
        } else {
            await redis.set(key, value);
        }
    },
    async delete(key: string) {
        await redis.del(key);
    },
};

export const auth = betterAuth({
    appName: "Youtube",
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    secondaryStorage: redisSecondaryStorage,
    session: {
        expiresIn: 86400, // Must match client config
        storeSessionInDatabase: true,
    },
    advanced: {
        useSecureCookies: process.env.NODE_ENV === "production",
    },
});
