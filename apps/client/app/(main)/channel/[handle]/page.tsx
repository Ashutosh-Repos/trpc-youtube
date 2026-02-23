import { trpcServer } from "@/lib/trpc-server";
import { ChannelClient } from "./channel-client";
import { notFound } from "next/navigation";

export default async function ChannelPage({
    params,
}: {
    params: Promise<{ handle: string }>;
}) {
    const { handle } = await params;

    // Strip the leading "@" from the handle if present
    const cleanHandle = handle.startsWith("@") ? handle.slice(1) : handle;

    try {
        const { channel, isSubscribed } =
            await trpcServer.channel.getChannelByHandle.query({
                handle: cleanHandle,
            });

        return (
            <ChannelClient
                channel={channel as any}
                isSubscribed={isSubscribed}
            />
        );
    } catch (e) {
        notFound();
    }
}
