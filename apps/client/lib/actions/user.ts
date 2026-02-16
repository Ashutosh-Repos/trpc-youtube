"use server";

import { auth } from "@/lib/auth/auth";
import prisma from "@/lib/prisma";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionResponse, createErrorResponse } from "./schema-types";
import { cache } from "react";

export const getSession = cache(async () => {
    try {
        return await auth.api.getSession({
            headers: await headers(),
        });
    } catch (error) {
        return null;
    }
});

export const getSessionUser = cache(async () => {
    const session = await getSession();
    return session?.user || null;
});

/**
 * Get user's detailed profile (memoized for request)
 */
export const getCachedUserProfile = cache(async (userId: string) => {
    return await prisma.user.findUnique({
        where: { id: userId },
        include: {
            channels: {
                where: { deletedAt: null },
                select: {
                    id: true,
                    handle: true,
                    name: true,
                    image: true,
                    isVerified: true,
                    status: true,
                    subscriberCount: true,
                    videoCount: true,
                    totalViews: true,
                },
            },
        },
    });
});

/**
 * Get user's subscribed channels (memoized for request)
 */
export const getCachedSubscriptions = cache(async (userId: string) => {
    return await prisma.subscription.findMany({
        where: { subscriberId: userId },
        include: {
            channel: {
                select: {
                    id: true,
                    name: true,
                    handle: true,
                    image: true,
                },
            },
        },
    });
});

// --- IDENTITY ACTIONS ---

/**
 * Get current authenticated user session
 */
export async function getUser(): Promise<ActionResponse<any>> {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user) {
            return createErrorResponse(
                "UNAUTHORIZED",
                "Not authenticated",
                401,
            );
        }

        return { success: true, data: session.user };
    } catch (error) {
        console.error("[User] Get session failed:", error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            "Failed to retrieve session",
        );
    }
}

/**
 * List all connected accounts (e.g., Google, GitHub, Credentials)
 */
export async function getUserAccounts(): Promise<ActionResponse<any[]>> {
    try {
        const accounts = await auth.api.listUserAccounts({
            headers: await headers(),
        });
        return { success: true, data: accounts || [] };
    } catch (error) {
        console.error("[User] List accounts failed:", error);
        return createErrorResponse("INTERNAL_ERROR", "Failed to list accounts");
    }
}

/**
 * List all active sessions across devices
 */
export async function getUserSessions(): Promise<ActionResponse<any>> {
    try {
        const sessions = await auth.api.listSessions({
            headers: await headers(),
        });
        return { success: true, data: sessions };
    } catch (error) {
        console.error("[User] List sessions failed:", error);
        return createErrorResponse("INTERNAL_ERROR", "Failed to list sessions");
    }
}

/**
 * Revoke a specific session by token
 */
export async function revokeSession(
    sessionId: string,
): Promise<ActionResponse<void>> {
    try {
        await auth.api.revokeSession({
            headers: await headers(),
            body: {
                token: sessionId,
            },
        });
        return { success: true, data: undefined };
    } catch (error) {
        console.error("[User] Revoke session failed:", error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            "Failed to revoke session",
        );
    }
}

/**
 * Revoke all sessions except the current one
 */
export async function revokeOtherSessions(): Promise<ActionResponse<void>> {
    try {
        await auth.api.revokeOtherSessions({
            headers: await headers(),
        });
        return { success: true, data: undefined };
    } catch (error) {
        console.error("[User] Revoke other sessions failed:", error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            "Failed to revoke other sessions",
        );
    }
}

// --- PROFILE ACTIONS ---

/**
 * Get detailed user profile including owned channels
 */
export async function getUserProfile(): Promise<ActionResponse<any>> {
    try {
        const sessionUser = await getSessionUser();

        if (!sessionUser)
            return createErrorResponse("UNAUTHORIZED", "Login required", 401);

        const user = await getCachedUserProfile(sessionUser.id);

        if (!user)
            return createErrorResponse("NOT_FOUND", "User not found", 404);

        return { success: true, data: user };
    } catch (error) {
        console.error("[User] Get profile failed:", error);
        return createErrorResponse("INTERNAL_ERROR", "Failed to fetch profile");
    }
}

const socialLinkSchema = z.object({
    platform: z.string(),
    url: z.string().url(),
    title: z.string().optional(),
});

const businessInfoSchema = z.object({
    inquiryEmail: z.string().email().optional().or(z.literal("")),
});

const contactInfoSchema = z.object({
    phone: z.string().optional(),
    address: z.string().optional(),
});

const updateUserSchema = z.object({
    name: z.string().min(2).optional(),
    bio: z.string().optional(),
    websiteUrl: z.string().url().optional().or(z.literal("")),
    location: z.string().optional(),
    image: z.string().optional(),
    bannerUrl: z.string().optional(),
    socialLinks: z.array(socialLinkSchema).optional(),
    businessInfo: businessInfoSchema.optional(),
    contactInfo: contactInfoSchema.optional(),
});

export type UpdateUserType = z.infer<typeof updateUserSchema>;

/**
 * Update user profile details
 */
export async function updateUser(
    data: UpdateUserType,
): Promise<ActionResponse<any>> {
    try {
        const sessionUser = await getSessionUser();
        if (!sessionUser)
            return createErrorResponse("UNAUTHORIZED", "Login required", 401);

        const validatedData = updateUserSchema.parse(data);

        const updatedUser = await prisma.user.update({
            where: { id: sessionUser.id },
            data: validatedData,
        });

        revalidatePath("/me");
        return { success: true, data: updatedUser };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return createErrorResponse(
                "VALIDATION_ERROR",
                error.issues[0].message,
            );
        }
        console.error("[User] Update profile failed:", error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            "Failed to update profile",
        );
    }
}
