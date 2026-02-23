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

    // Validate that the user owns this channel
    // We can reuse getUserChannels for this, or create a specific 'getChannel' procedure
    // For efficiency, let's use getUserChannels and check if the ID is in the list
    // A more optimized approach would be a dedicated procedure, but this is fine for now
    let isValidChannel = false;
    try {
        const result = await trpcServer.channel.getUserChannels.query();
        if (result.success && result.channels) {
            isValidChannel = result.channels.some(
                (c: any) => c.id === channelId,
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
            {/* // <div className="flex h-full w-full overflow-hidden">  */}
            <StudioSideNav channelId={channelId} />
            <div className="flex-1 overflow-auto h-full w-full">{children}</div>
            {/* </div> */}
        </>
    );
}
