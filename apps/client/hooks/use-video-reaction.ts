import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@youtube/server/src/trpc/router";

type VideoData = inferRouterOutputs<AppRouter>["video"]["getPublicVideo"];

interface UseVideoReactionProps {
    videoId: string;
    reactiveData: {
        likeCount: number;
        dislikeCount: number;
        liked: boolean;
        disliked: boolean;
    };
}

export function useVideoReaction({
    videoId,
    reactiveData,
}: UseVideoReactionProps) {
    const utils = trpc.useUtils();

    // Independent local state for instant UI across any component
    const [localState, setLocalState] = useState(reactiveData);

    // Sync if parent provides new reactiveData (e.g. from background query)
    useEffect(() => {
        setLocalState(reactiveData);
    }, [
        reactiveData.likeCount,
        reactiveData.dislikeCount,
        reactiveData.liked,
        reactiveData.disliked,
    ]);

    const performOptimisticUpdate = (action: "LIKE" | "DISLIKE") => {
        setLocalState((prev) => {
            let newLikeCount = prev.likeCount;
            let newDislikeCount = prev.dislikeCount;
            let isNowLiked = prev.liked;
            let isNowDisliked = prev.disliked;

            if (action === "LIKE") {
                if (prev.liked) {
                    newLikeCount--;
                    isNowLiked = false;
                } else {
                    newLikeCount++;
                    isNowLiked = true;
                    if (prev.disliked) {
                        newDislikeCount--;
                        isNowDisliked = false;
                    }
                }
            } else {
                if (prev.disliked) {
                    newDislikeCount--;
                    isNowDisliked = false;
                } else {
                    newDislikeCount++;
                    isNowDisliked = true;
                    if (prev.liked) {
                        newLikeCount--;
                        isNowLiked = false;
                    }
                }
            }

            const newState = {
                likeCount: Math.max(0, newLikeCount),
                dislikeCount: Math.max(0, newDislikeCount),
                liked: isNowLiked,
                disliked: isNowDisliked,
            };

            // Also cautiously update top-level cache if it exists
            utils.video.getPublicVideo.setData({ videoId }, (oldData) => {
                if (!oldData) return oldData;
                return {
                    ...oldData,
                    likeCount: newState.likeCount,
                    dislikeCount: newState.dislikeCount,
                    engagement: {
                        ...oldData.engagement,
                        liked: newState.liked,
                        disliked: newState.disliked,
                        subscribed: oldData.engagement?.subscribed || false,
                    },
                };
            });

            return newState;
        });
    };

    const toggleLike = trpc.engagement.toggleLike.useMutation({
        onMutate: async () => {
            await utils.video.getPublicVideo.cancel({ videoId });
            const prev = utils.video.getPublicVideo.getData({ videoId });
            const prevLocal = localState;
            performOptimisticUpdate("LIKE");
            return { prev, prevLocal };
        },
        onError: (_err, _vars, ctx) => {
            if (ctx?.prev !== undefined) {
                utils.video.getPublicVideo.setData({ videoId }, ctx.prev);
            }
            if (ctx?.prevLocal) {
                setLocalState(ctx.prevLocal);
            }
            toast.error("Failed to update like");
        },
    });

    const toggleDislike = trpc.engagement.toggleDislike.useMutation({
        onMutate: async () => {
            await utils.video.getPublicVideo.cancel({ videoId });
            const prev = utils.video.getPublicVideo.getData({ videoId });
            const prevLocal = localState;
            performOptimisticUpdate("DISLIKE");
            return { prev, prevLocal };
        },
        onError: (_err, _vars, ctx) => {
            if (ctx?.prev !== undefined) {
                utils.video.getPublicVideo.setData({ videoId }, ctx.prev);
            }
            if (ctx?.prevLocal) {
                setLocalState(ctx.prevLocal);
            }
            toast.error("Failed to update dislike");
        },
    });

    return {
        likeCount: localState.likeCount,
        dislikeCount: localState.dislikeCount,
        isLiked: localState.liked,
        isDisliked: localState.disliked,
        toggleLike: () => toggleLike.mutate({ videoId }),
        toggleDislike: () => toggleDislike.mutate({ videoId }),
    };
}
