import { trpcServer } from "@/lib/trpc-server";
import { InfiniteData } from "@tanstack/react-query";
import { RouterOutputs } from "@/lib/trpc-shared";
import { VideoTableClient } from "../_components/video-table-client";

export default async function ContentVideosPage(props: {
    params: Promise<{ channelId: string }>;
    searchParams: Promise<{
        search?: string;
        visibility?: string;
        isAgeRestricted?: string;
        sortOrder?: string;
    }>;
}) {
    const { channelId } = await props.params;
    const searchParams = await props.searchParams;

    const visibility = searchParams.visibility as
        | "PUBLIC"
        | "PRIVATE"
        | "UNLISTED"
        | "SCHEDULED"
        | undefined;
    const isAgeRestricted =
        searchParams.isAgeRestricted === "true"
            ? true
            : searchParams.isAgeRestricted === "false"
              ? false
              : undefined;
    const sortOrder =
        (searchParams.sortOrder as "newest" | "oldest" | "views") || "newest";
    const rawSearch = searchParams.search;
    const search = Array.isArray(rawSearch) ? rawSearch[0] : rawSearch;

    const firstPage = await trpcServer.video.getChannelContent.query({
        channelId,
        isShort: false,
        search,
        visibility,
        isAgeRestricted,
        sortOrder,
        limit: 30,
    });

    const initialVideos: InfiniteData<
        RouterOutputs["video"]["getChannelContent"],
        string | undefined
    > = {
        pages: [firstPage],
        pageParams: [undefined],
    };

    return (
        <VideoTableClient
            channelId={channelId}
            isShort={false}
            initialData={initialVideos}
        />
    );
}
