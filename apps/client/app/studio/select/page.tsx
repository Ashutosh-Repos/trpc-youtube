import { trpcServer } from "@/lib/trpc-server";
import { ChannelSelectionClient } from "../_components/ChannelSelectionClient";
import { BackgroundLines } from "@/components/ui/background-lines";
import { getMediaUrl } from "@/lib/utils";
import { XCircle } from "lucide-react";

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
            <div className="flex h-full w-full flex-col items-center justify-center gap-6 text-center p-8">
                <div className="p-4 rounded-full bg-destructive/10 text-destructive mb-2">
                    <XCircle className="w-12 h-12" />
                </div>
                <h2 className="text-3xl font-black tracking-tighter uppercase text-foreground/90">
                    Something went wrong
                </h2>
                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/40 max-w-sm">
                    Failed to load your channels. Please check your connection
                    and try again later.
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
                <div className="w-full h-full flex flex-col items-center justify-center space-y-12">
                    <div className="space-y-2 text-center">
                        <h1 className="text-4xl max-sm:text-3xl font-black tracking-tighter uppercase text-foreground/90 max-w-2xl px-4 leading-[1.1]">
                            Select a channel to continue with studio
                        </h1>
                        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-primary/60">
                            Creator Hub
                        </p>
                    </div>
                    <div className="w-max h-max flex flex-wrap">
                        <ChannelSelectionClient items={items} />
                    </div>
                </div>
            </div>
        </BackgroundLines>
    );
};

export default SelectChannelPage;
