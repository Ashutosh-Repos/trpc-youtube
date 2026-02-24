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

    let result;
    try {
        result = await trpcServer.channel.getChannelByHandle.query({
            handle: cleanHandle,
        });
    } catch {
        notFound();
    }

    return (
        <ChannelClient
            // @ts-expect-error DTO conversion
            channel={result.channel}
            isSubscribed={result.isSubscribed}
        />
    );
}
