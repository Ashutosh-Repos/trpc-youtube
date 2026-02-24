import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "@/lib/prisma";
import redis from "@/lib/redis";
import { hash, compare } from "bcryptjs";
import { nextCookies } from "better-auth/next-js";
import { emailService } from "@/lib/mailer/email";
import { ac, admin, user } from "@/lib/auth/admin";
import { admin as adminPlugin } from "better-auth/plugins/admin";

// Redis adapter for Better Auth secondary storage (rate limiting, sessions)
// Guards against null redis client (build-time when REDIS_URL is not set)
const redisSecondaryStorage = {
    async get(key: string) {
        if (!redis) return null;
        const value = await redis.get(key);
        return value ? value : null;
    },
    async set(key: string, value: string, ttl?: number) {
        if (!redis) return;
        if (ttl) {
            await redis.set(key, value, "EX", ttl);
        } else {
            await redis.set(key, value);
        }
    },
    async delete(key: string) {
        if (!redis) return;
        await redis.del(key);
    },
};

const hashPassword = async (plain: string): Promise<string> => {
    return await hash(plain, 12);
};

const verifyPassword = async ({
    hash,
    password,
}: {
    hash: string;
    password: string;
}): Promise<boolean> => {
    return await compare(password, hash);
};

export const auth = betterAuth({
    baseURL:
        process.env.BETTER_AUTH_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        "http://localhost:3000",
    appName: "Youtube",
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    user: {
        deleteUser: {
            enabled: true,
            sendDeleteAccountVerification: async ({ user, url }) => {
                await emailService.sendDeleteAccountVerificationMail(
                    user.email,
                    url,
                    user.name,
                );
            },
        },
        additionalFields: {
            dob: { type: "date", required: false, returned: true },
        },
    },
    emailVerification: {
        sendVerificationEmail: async ({ user, url }) => {
            await emailService.sendEmailVerificationMail(
                user.email,
                url,
                user.name,
            );
        },
        sendOnSignUp: true,
        autoSignInAfterVerification: true,
        expiresIn: 3600,
    },
    emailAndPassword: {
        enabled: true,
        sendResetPassword: async ({ user, url }) => {
            await emailService.sendPasswordResetMail(
                user.email,
                url,
                user.name,
            );
        },
        password: {
            hash: hashPassword,
            verify: verifyPassword,
        },
        minPasswordLength: 8,
        maxPasswordLength: 128,
        requireEmailVerification: true,
        revokeSessionsOnPasswordReset: true,
        autoSignIn: true,
        resetPasswordTokenExpiresIn: 3600,
    },
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID || "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        },
        github: {
            clientId: process.env.GITHUB_CLIENT_ID || "",
            clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
        },
    },
    session: {
        expiresIn: 86400,
        storeSessionInDatabase: true,
    },
    account: {
        accountLinking: {
            enabled: true,
            allowDifferentEmails: false,
            trustedProviders: ["google", "github"],
        },
    },
    verification: {
        disableCleanup: false,
    },
    rateLimit: {
        enabled: true,
        window: 60, // 60 second window (production default)
        max: 100, // 100 requests per window
        storage: "secondary-storage", // Use Redis for high-performance rate limiting
        customRules: {
            // Stricter limits for sensitive authentication paths
            "/sign-in/email": {
                window: 10,
                max: 5, // 5 attempts per 10 seconds
            },
            "/sign-up/email": {
                window: 60,
                max: 5,
            },
            "/forgot-password": {
                window: 60,
                max: 3,
            },
            "/reset-password": {
                window: 60,
                max: 5,
            },
            "/two-factor/*": {
                window: 10,
                max: 3,
            },
        },
    },
    secondaryStorage: redisSecondaryStorage,
    advanced: {
        ipAddress: {
            disableIpTracking: false,
            ipv6Subnet: 64, // Rate limit by /64 subnet to prevent IPv6 rotation attacks
        },
        useSecureCookies: process.env.NODE_ENV === "production",
        disableCSRFCheck: false,
        disableOriginCheck: false,
        defaultCookieAttributes: {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
        },
    },
    databaseHooks: {
        user: {
            create: {
                after: async (user) => {
                    console.log(
                        `[AUTH] User created in DB: ${user.email} (${user.id})`,
                    );
                    try {
                        await emailService.sendUserJoiningMail(
                            user.email,
                            user.name,
                        );
                    } catch (error) {
                        console.error(
                            "[AUTH] Failed to send joining mail:",
                            error,
                        );
                        // Do not throw, we want the user to be created regardless of email success
                    }
                },
            },
            update: {
                after: async (user) => {
                    console.log(
                        `[AUTH] User updated in DB: ${user.email} | DOB: ${user.dob}`,
                    );
                },
            },
        },
        account: {
            create: {
                before: async (account) => {
                    // Audit log for account linking — non-blocking
                    if (account.providerId === "credential") return;

                    const existingUser = await prisma.user.findUnique({
                        where: { id: account.userId },
                    });

                    if (existingUser) {
                        const isNewUser =
                            Date.now() - existingUser.createdAt.getTime() <
                            30 * 1000;
                        if (!isNewUser) {
                            console.log(
                                `[AUTH] Account linked: ${existingUser.email} ← ${account.providerId}`,
                            );
                        }
                    }
                },
            },
        },
    },

    plugins: [
        nextCookies(),
        adminPlugin({
            ac,
            roles: {
                admin,
                user,
            },
        }),
    ],
});
