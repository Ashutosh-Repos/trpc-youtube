import { trpcServer } from "@/lib/trpc-server";
import { notFound, redirect } from "next/navigation";
import StudioSettingsClient from "./_components/client";

interface PageProps {
    params: Promise<{ channelId: string }>;
}

export default async function StudioSettingsPage({ params }: PageProps) {
    const { channelId } = await params;

    try {
        const { channel } = await trpcServer.channel.getChannelById.query({
            channelId,
        });
        return <StudioSettingsClient channel={channel} />;
    } catch (error: any) {
        if (error?.data?.code === "NOT_FOUND") notFound();
        if (error?.data?.code === "UNAUTHORIZED") redirect("/login");
        if (error?.data?.code === "FORBIDDEN") redirect("/studio");
        return <div>Error loading settings</div>;
    }
}
