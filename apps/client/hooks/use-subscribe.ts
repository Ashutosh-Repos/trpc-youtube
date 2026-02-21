import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/auth-client";

interface UseSubscribeProps {
    channelId: string;
    initialData: {
        isSubscribed: boolean;
        subscriberCount: number;
    };
    onSubscriptionChange?: (isSubscribed: boolean) => void;
}

export function useSubscribe({
    channelId,
    initialData,
    onSubscriptionChange,
}: UseSubscribeProps) {
    const { data: session } = authClient.useSession();
    const [isSubscribed, setIsSubscribed] = useState(initialData.isSubscribed);
    const [subscriberCount, setSubscriberCount] = useState(
        initialData.subscriberCount,
    );

    const utils = trpc.useUtils();

    const toggleSubscriptionMutation =
        trpc.channel.toggleSubscription.useMutation({
            onMutate: async () => {
                if (!session?.user) {
                    toast.error("Please login to subscribe");
                    return {
                        prevSubscribed: isSubscribed,
                        prevCount: subscriberCount,
                    };
                }

                // Optimistically update state
                const newIsSubscribed = !isSubscribed;

                setIsSubscribed(newIsSubscribed);
                setSubscriberCount((prev) =>
                    newIsSubscribed ? prev + 1 : Math.max(0, prev - 1),
                );

                return {
                    prevSubscribed: isSubscribed,
                    prevCount: subscriberCount,
                };
            },
            onError: (err, variables, context) => {
                // Revert on error
                if (context) {
                    setIsSubscribed(context.prevSubscribed);
                    setSubscriberCount(context.prevCount);
                }
                toast.error(err.message || "Failed to update subscription");
            },
            onSuccess: (data) => {
                if (data.action === "SUBSCRIBED") {
                    toast.success("Subscribed");
                } else {
                    toast.success("Unsubscribed");
                }

                onSubscriptionChange?.(data.action === "SUBSCRIBED");

                // Invalidate relevant queries (if any other views need to know)
                utils.channel.getChannelByHandle.invalidate();
                utils.video.getPublicVideo.invalidate();
                // Don't strongly block on the invalidate though, our local state is already right
            },
            onSettled: () => {
                // optionally refetch or sync if needed
            },
        });

    const toggleSubscribe = () => {
        if (!session?.user) {
            toast.error("Please login to subscribe");
            return;
        }
        toggleSubscriptionMutation.mutate({ channelId });
    };

    return {
        isSubscribed,
        subscriberCount,
        toggleSubscribe,
        isLoading: toggleSubscriptionMutation.isPending,
    };
}
