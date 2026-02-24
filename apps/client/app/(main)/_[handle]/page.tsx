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

    let res;
    try {
        res = await trpcServer.channel.getChannelByHandle.query({
            handle: cleanHandle,
        });
    } catch {
        notFound();
    }

    if (!res?.channel) {
        notFound();
    }

    const { channel, isSubscribed } = res;

    return (
        <ChannelClient
            channel={
                channel as unknown as React.ComponentProps<
                    typeof ChannelClient
                >["channel"]
            }
            isSubscribed={isSubscribed}
        />
    );
}
