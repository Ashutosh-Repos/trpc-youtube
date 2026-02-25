import { trpcServer } from "@/lib/trpc-server";
import { redirect } from "next/navigation";
import { StudioSideNav } from "../_components/StudioSideNav";

export default async function ChannelStudioLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ channelId: string }>;
}) {
    const { channelId } = await params;

    let isValidChannel = false;
    try {
        const result = await trpcServer.channel.getUserChannels.query();
        if (result.success && result.channels) {
            isValidChannel = result.channels.some(
                (c: { id: string }) => c.id === channelId,
            );
        }
    } catch (error) {
        console.error("Failed to validate channel access", error);
    }

    if (!isValidChannel) {
        redirect("/studio/select");
    }

    return (
        <>
            <StudioSideNav channelId={channelId} />
            <div className="flex-1 overflow-auto h-full w-full">{children}</div>
        </>
    );
}
