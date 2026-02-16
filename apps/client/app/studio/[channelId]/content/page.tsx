import { trpcServer } from "@/lib/trpc-server";
import { notFound, redirect } from "next/navigation";
import ContentClient from "./_components/client";

interface ContentPageProps {
    params: Promise<{
        channelId: string;
    }>;
}

export default async function ContentPage({ params }: ContentPageProps) {
    const { channelId } = await params;

    try {
        const [channelResponse, videos] = await Promise.all([
            trpcServer.channel.getChannelById.query({ channelId }),
            trpcServer.video.getChannelContent.query({
                channelId,
                limit: 30,
                isShort: false,
            }),
        ]);

        const { channel } = channelResponse;

        return (
            <div className="flex-1 h-full flex flex-col overflow-hidden bg-background">
                <ContentClient
                    channelId={channelId}
                    channelName={channel.name}
                    initialVideos={{
                        pages: [videos],
                        pageParams: [undefined],
                    }}
                />
            </div>
        );
    } catch (error: any) {
        if (error?.data?.code === "UNAUTHORIZED") {
            redirect("/login");
        }
        // console.error("Error loading content page:", error);
        notFound();
    }
}
