import { trpcServer } from "@/lib/trpc-server";
import { ChannelSelectionClient } from "../_components/ChannelSelectionClient";
import { BackgroundLines } from "@/components/ui/background-lines";
import { getMediaUrl } from "@/lib/utils";

import type { AppRouter } from "@youtube/server/src/trpc/router";
import { inferRouterOutputs } from "@trpc/server";

type RouterOutput = inferRouterOutputs<AppRouter>;
type ChannelList = RouterOutput["channel"]["getUserChannels"]["channels"];

const SelectChannelPage = async () => {
    let channels: ChannelList = [];
    try {
        const result = await trpcServer.channel.getUserChannels.query();
        if (result.success && result.channels) {
            channels = result.channels;
        }
    } catch (error) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-center">
                <h2 className="text-2xl font-bold tracking-tight">
                    Something went wrong
                </h2>
                <p className="text-muted-foreground">
                    Failed to load your channels. Please try again later.
                </p>
            </div>
        );
    }

    const items = channels.map((channel, idx) => ({
        id: idx,
        originalId: channel.id,
        name: channel.name,
        designation: `${channel.subscriberCount} Subs • ${channel.videoCount} Videos`,
        image: getMediaUrl(channel.image || ""),
        href: `/studio/${channel.id}`,
    }));
    return (
        <BackgroundLines className="w-full h-full flex flex-col items-center justify-center overflow-hidden">
            <div className="w-full h-full overflow-scroll rounded-md">
                <div className="w-full h-full flex flex-col items-center justify-center space-y-8">
                    <h1 className="text-2xl max-sm:max-w-xs font-bold text-center text-wrap">
                        Select a channel to continue with studio
                    </h1>
                    <div className="w-max h-max flex flex-wrap">
                        <ChannelSelectionClient items={items} />
                    </div>
                </div>
            </div>
        </BackgroundLines>
    );
};

export default SelectChannelPage;
