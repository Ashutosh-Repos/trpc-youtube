// Handle regex: Alphanumeric, underscores, periods. No spaces.
import { z } from "zod";
export const handleRegex = /^[a-zA-Z0-9_.]+$/;
export const linkSchema = z.object({
    title: z.string().min(1).max(100),
    url: z.string().url().max(2000),
});
export const featureFlagsSchema = z
    .object({
        canLiveStream: z.boolean().optional(),
        canUpload: z.boolean().optional(),
    })
    .optional();

export const createChannelSchema = z.object({
    name: z.string().min(1).max(50),
    handle: z
        .string()
        .min(3)
        .max(30)
        .regex(
            handleRegex,
            "Handle can only contain letters, numbers, underscores, and periods.",
        ),
    description: z.string().max(5000).optional(),
    image: z.string().url().optional().or(z.literal("")),
    bannerUrl: z.string().url().optional().or(z.literal("")),
    contactEmail: z.string().email().optional().or(z.literal("")),
    location: z.string().max(100).optional(),
    links: z.array(linkSchema).max(20).optional(),
    // featureFlags: featureFlagsSchema.optional(),
});

export const updateChannelSchema = z.object({
    name: z.string().min(1).max(50).optional(),
    handle: z
        .string()
        .min(3)
        .max(30)
        .regex(
            handleRegex,
            "Handle can only contain letters, numbers, underscores, and periods.",
        )
        .optional(),
    description: z.string().max(5000).optional(),
    image: z.string().url().optional().or(z.literal("")),
    bannerUrl: z.string().url().optional().or(z.literal("")),
    contactEmail: z.string().email().optional().or(z.literal("")),
    location: z.string().max(100).optional(),
    links: z.array(linkSchema.partial()).max(20).optional(),
    tags: z.array(z.string()).max(50).optional(),
    featureFlags: featureFlagsSchema.optional(),
});

export type CreateChannelType = z.infer<typeof createChannelSchema>;
export type UpdateChannelType = z.infer<typeof updateChannelSchema>;

export const videoVisibilitySchema = z.enum([
    "PUBLIC",
    "PRIVATE",
    "UNLISTED",
    "SCHEDULED",
]);

export const videoContentFilterSchema = z.object({
    visibility: videoVisibilitySchema.optional(),
    search: z.string().optional(),
    isShort: z.boolean().optional(),
    isAgeRestricted: z.boolean().optional(),
    limit: z.number().min(1).max(100).default(30),
    cursor: z.string().optional(),
    sortOrder: z.enum(["newest", "oldest", "views"]).default("newest"),
});

export const getChannelContentSchema = z.object({
    filters: z.lazy(() => videoContentFilterSchema.optional()),
});

export type VideoContentFilterType = z.infer<typeof videoContentFilterSchema>;
export type VideoContentFilterInput = z.input<typeof videoContentFilterSchema>;
export type GetChannelContentType = z.infer<typeof getChannelContentSchema>;
export type GetChannelContentInput = z.input<typeof getChannelContentSchema>;

export const createPlaylistSchema = z.object({
    title: z.string().min(1, "Title is required").max(150),
    description: z.string().max(5000).optional(),
    visibility: videoVisibilitySchema.default("PUBLIC"),
    channelId: z.string().optional(),
});

export const updatePlaylistSchema = z.object({
    title: z.string().min(1).max(150).optional(),
    description: z.string().max(5000).optional(),
    visibility: videoVisibilitySchema.optional(),
});

export type CreatePlaylistType = z.infer<typeof createPlaylistSchema>;
export type UpdatePlaylistType = z.infer<typeof updatePlaylistSchema>;
export type CreatePlaylistInput = z.input<typeof createPlaylistSchema>;
export type UpdatePlaylistInput = z.input<typeof updatePlaylistSchema>;

export type ActionResponse<T> =
    | { success: true; data: T }
    | {
          success: false;
          error: { code: string; message: string; status?: number };
      };
export interface UserBasicInfo {
    id: string;
    name: string;
    image?: string | null;
}

export interface CommentWithUser {
    id: string;
    videoId: string;
    userId: string;
    content: string;
    likeCount: number;
    dislikeCount: number;
    replyCount: number;
    parentId: string | null;
    createdAt: Date;
    users: UserBasicInfo;
}

export interface GetCommentsResponse {
    comments: CommentWithUser[];
    nextCursor?: string;
}

/**
 * Standard action error response helper
 */
export function createErrorResponse(
    code: string,
    message: string,
    status = 400,
): ActionResponse<never> {
    return {
        success: false,
        error: { code, message, status },
    };
}
