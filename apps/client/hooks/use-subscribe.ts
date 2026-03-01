import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/auth-client";

interface UseSubscribeProps {
    channelId: string;
    reactiveData: {
        isSubscribed: boolean;
        subscriberCount: number;
    };
    onSubscriptionChange?: (isSubscribed: boolean) => void;
}

export function useSubscribe({
    channelId,
    reactiveData,
    onSubscriptionChange,
}: UseSubscribeProps) {
    const { data: session } = authClient.useSession();
    const utils = trpc.useUtils();

    const [localState, setLocalState] = useState(reactiveData);

    useEffect(() => {
        setLocalState(reactiveData);
    }, [reactiveData.isSubscribed, reactiveData.subscriberCount]);

    const performOptimisticUpdate = () => {
        setLocalState((prev) => {
            const newState = {
                isSubscribed: !prev.isSubscribed,
                subscriberCount: prev.isSubscribed
                    ? Math.max(0, prev.subscriberCount - 1)
                    : prev.subscriberCount + 1,
            };

            return newState;
        });
    };

    const toggleSubscriptionMutation =
        trpc.channel.toggleSubscription.useMutation({
            onMutate: async () => {
                await utils.channel.getChannelByHandle.cancel({
                    handle: channelId,
                });
                const prev = utils.channel.getChannelByHandle.getData({
                    handle: channelId,
                });
                const prevLocal = localState;
                performOptimisticUpdate();
                return { prev, prevLocal };
            },
            onError: (err, _vars, ctx) => {
                if (ctx?.prev !== undefined) {
                    utils.channel.getChannelByHandle.setData(
                        { handle: channelId },
                        ctx.prev,
                    );
                }
                if (ctx?.prevLocal) {
                    setLocalState(ctx.prevLocal);
                }
                toast.error(err.message || "Failed to update subscription");
            },
            onSuccess: (data) => {
                onSubscriptionChange?.(data.action === "SUBSCRIBED");
            },
            onSettled: () => {
                utils.channel.getChannelByHandle.invalidate({
                    handle: channelId,
                });
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
        isSubscribed: localState.isSubscribed,
        subscriberCount: localState.subscriberCount,
        toggleSubscribe,
        isLoading: toggleSubscriptionMutation.isPending,
    };
}
