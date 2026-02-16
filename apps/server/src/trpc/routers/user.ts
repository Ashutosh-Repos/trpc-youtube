import { router, protectedProcedure } from "../trpc";
import { z } from "zod";
import prisma from "../../lib/prisma";
import { TRPCError } from "@trpc/server";

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

export const userRouter = router({
    getProfile: protectedProcedure.query(async ({ ctx }) => {
        const user = await prisma.user.findUnique({
            where: { id: ctx.user.id },
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

        if (!user) {
            throw new TRPCError({
                code: "NOT_FOUND",
                message: "User not found",
            });
        }

        return user;
    }),

    updateProfile: protectedProcedure
        .input(updateUserSchema)
        .mutation(async ({ ctx, input }) => {
            try {
                const user = await prisma.user.update({
                    where: { id: ctx.user.id },
                    data: input,
                });
                return user;
            } catch (error) {
                console.error("Failed to update user profile:", error);
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to update profile",
                });
            }
        }),
});
