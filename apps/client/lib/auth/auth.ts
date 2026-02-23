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
            clientId: process.env.GOOGLE_CLIENT_ID! as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET! as string,
        },
        github: {
            clientId: process.env.GITHUB_CLIENT_ID! as string,
            clientSecret: process.env.GITHUB_CLIENT_SECRET! as string,
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
            trustedProviders: ["none"],
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
                before: async (account, ctx) => {
                    // Start of Security Hook: Block Auto-Linking
                    if (account.providerId === "credential") return;

                    const user = await prisma.user.findUnique({
                        where: { id: account.userId },
                    });

                    if (user) {
                        const isNewUser =
                            Date.now() - user.createdAt.getTime() < 30 * 1000; // 30 seconds threshold
                        if (!isNewUser) {
                            // User exists and is not brand new (so this is a linking attempt)

                            // Check if the request comes from an authenticated session
                            // We look for the session cookie in the headers
                            const cookieHeader =
                                ctx?.headers?.get("cookie") || "";
                            const hasSessionCookie = cookieHeader.includes(
                                "better-auth.session_token",
                            ); // Adjust cookie name if changed in config

                            if (!hasSessionCookie) {
                                console.warn(
                                    `[AUTH] Blocked auto-linking attempt for user: ${user.email} with provider: ${account.providerId}`,
                                );
                                // Returning false cancels the operation in better-auth hooks
                                // Ideally we would throw an error to inform the user, but false creates a generic failure
                                // Let's throw to be explicit if possible, or return false.
                                // Throwing might cause a 500 or proper error. Let's try throwing.
                                throw new Error(
                                    "Automatic account linking is disabled. Please log in with your existing account and link this provider from settings.",
                                );
                            }
                        }
                    }
                    // End of Security Hook
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
