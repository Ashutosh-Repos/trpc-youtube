import { trpcServer } from "@/lib/trpc-server";
import { notFound, redirect } from "next/navigation";
import StudioSettingsClient from "./_components/client";

interface PageProps {
    params: Promise<{ channelId: string }>;
}

export default async function StudioSettingsPage({ params }: PageProps) {
    const { channelId } = await params;

    let channel;
    try {
        const result = await trpcServer.channel.getChannelById.query({
            channelId,
        });
        channel = result.channel;
    } catch (err) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const error = err as any;
        if (error?.data?.code === "NOT_FOUND") notFound();
        if (error?.data?.code === "UNAUTHORIZED") redirect("/login");
        if (error?.data?.code === "FORBIDDEN") redirect("/studio");
    }

    if (!channel) {
        return <div>Error loading settings</div>;
    }

    return <StudioSettingsClient channel={channel} />;
}
