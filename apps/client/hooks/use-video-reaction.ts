import { trpc } from "@/lib/trpc";
import { useState, useCallback } from "react";
import { toast } from "sonner";

interface UseVideoReactionProps {
    videoId: string;
    initialData: {
        likeCount: number;
        dislikeCount: number;
        liked: boolean;
        disliked: boolean;
    };
}

export function useVideoReaction({
    videoId,
    initialData,
}: UseVideoReactionProps) {
    const [state, setState] = useState(initialData);

    const utils = trpc.useUtils();

    const toggleLike = trpc.engagement.toggleLike.useMutation({
        onMutate: async () => {
            await utils.video.getPublicVideo.cancel({ videoId });

            const previousState = state;

            // Optimistic Update
            setState((prev) => {
                let newLikeCount = prev.likeCount;
                let newDislikeCount = prev.dislikeCount;
                const wasLiked = prev.liked;
                const wasDisliked = prev.disliked;

                // Toggle Logic
                if (wasLiked) {
                    newLikeCount--; // Remove Like
                } else {
                    newLikeCount++; // Add Like
                    if (wasDisliked) newDislikeCount--; // Remove Dislike if exists
                }

                return {
                    likeCount: Math.max(0, newLikeCount),
                    dislikeCount: Math.max(0, newDislikeCount),
                    liked: !wasLiked,
                    disliked: false, // Always false if liking
                };
            });

            return { previousState };
        },
        onError: (err, newTodo, context) => {
            toast.error("Failed to update like");
            if (context?.previousState) {
                setState(context.previousState);
            }
        },
        onSettled: () => {
            // We don't necessarily need to refetch immediately as we have optimistic state
            // But valid to refetch to get "true" count eventually
            // utils.video.getPublicVideo.invalidate({ videoId });
        },
    });

    const toggleDislike = trpc.engagement.toggleDislike.useMutation({
        onMutate: async () => {
            await utils.video.getPublicVideo.cancel({ videoId });
            const previousState = state;

            setState((prev) => {
                let newLikeCount = prev.likeCount;
                let newDislikeCount = prev.dislikeCount;
                const wasLiked = prev.liked;
                const wasDisliked = prev.disliked;

                if (wasDisliked) {
                    newDislikeCount--;
                } else {
                    newDislikeCount++;
                    if (wasLiked) newLikeCount--;
                }

                return {
                    likeCount: Math.max(0, newLikeCount),
                    dislikeCount: Math.max(0, newDislikeCount),
                    liked: false,
                    disliked: !wasDisliked,
                };
            });
            return { previousState };
        },
        onError: (err, newTodo, context) => {
            toast.error("Failed to update dislike");
            if (context?.previousState) {
                setState(context.previousState);
            }
        },
    });

    return {
        likeCount: state.likeCount,
        dislikeCount: state.dislikeCount,
        isLiked: state.liked,
        isDisliked: state.disliked,
        toggleLike: () => toggleLike.mutate({ videoId }),
        toggleDislike: () => toggleDislike.mutate({ videoId }),
    };
}
