import React from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatViewCount, getMediaUrl } from "@/lib/utils";
import { SubscribeButton } from "@/components/custom/subscribe-button";
import { useSubscribe } from "@/hooks/use-subscribe";

interface ChannelSearchCardProps {
    channel: {
        id: string;
        name: string;
        handle: string;
        image: string | null;
        subscriberCount: number;
        videoCount: number;
        isSubscribed: boolean;
    };
}

export function ChannelSearchCard({ channel }: ChannelSearchCardProps) {
    const channelUrl = `/@${channel.handle || channel.id}`;

    const { isSubscribed, subscriberCount, toggleSubscribe, isLoading } =
        useSubscribe({
            channelId: channel.id,
            initialData: {
                isSubscribed: channel.isSubscribed,
                subscriberCount: channel.subscriberCount,
            },
        });

    return (
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 border-b border-border/10 w-full hover:bg-neutral-900/40 transition-colors">
            <Link href={channelUrl} className="shrink-0">
                <Avatar className="w-24 h-24 sm:w-32 sm:h-32 mb-2 sm:mb-0">
                    <AvatarImage
                        src={getMediaUrl(channel.image)}
                        alt={channel.name}
                    />
                    <AvatarFallback className="text-2xl">
                        {channel.name?.charAt(0) || "C"}
                    </AvatarFallback>
                </Avatar>
            </Link>
            <div className="flex flex-col justify-center flex-1 text-center sm:text-left h-full sm:min-h-[128px]">
                <Link
                    href={channelUrl}
                    className="text-lg font-semibold hover:text-white transition-colors"
                >
                    {channel.name}
                </Link>
                <div className="text-sm text-muted-foreground mt-1 flex flex-col sm:flex-row items-center sm:items-start gap-1">
                    <span>@{channel.handle}</span>
                    <span className="hidden sm:inline">•</span>
                    <span>{formatViewCount(subscriberCount)} subscribers</span>
                    <span className="hidden sm:inline">•</span>
                    <span>{formatViewCount(channel.videoCount)} videos</span>
                </div>
                <div className="mt-4 flex justify-center sm:justify-start">
                    <SubscribeButton
                        isSubscribed={isSubscribed}
                        onClick={toggleSubscribe}
                        disabled={isLoading}
                    />
                </div>
            </div>
        </div>
    );
}
