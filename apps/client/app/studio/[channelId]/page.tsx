import { VideoUploadZone } from "@/components/custom/VideoUploadZone";
import { trpcServer } from "@/lib/trpc-server";
import { notFound, redirect } from "next/navigation";

interface PageProps {
    params: Promise<{
        channelId: string;
    }>;
}

export async function generateMetadata({ params }: PageProps) {
    const { channelId } = await params;
    try {
        const { channel } = await trpcServer.channel.getChannelById.query({
            channelId,
        });
        return {
            title: `Dashboard - ${channel.name} | Studio`,
        };
    } catch {
        return {
            title: `Dashboard - ${channelId} | Studio`,
        };
    }
}

export default async function StudioDashboardPage({ params }: PageProps) {
    const { channelId } = await params;

    try {
        const { channel } = await trpcServer.channel.getChannelById.query({
            channelId,
        });

        return (
            <div className="p-8 space-y-8">
                <div className="flex items-end justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">Dashboard</h1>
                        <p className="text-muted-foreground">
                            Manage videos and performance for{" "}
                            <span className="font-medium text-foreground">
                                {channel.name}
                            </span>
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="md:col-span-2">
                        <VideoUploadZone channelId={channelId} />
                    </div>

                    <div className="bg-card border rounded-xl p-6 h-fit">
                        <h2 className="font-semibold mb-4">
                            Channel Analytics
                        </h2>
                        <p className="text-xs text-muted-foreground italic">
                            Analytics data will be available here soon.
                        </p>
                    </div>
                </div>
            </div>
        );
    } catch (error: any) {
        if (error?.data?.code === "UNAUTHORIZED") {
            redirect("/login");
        }
        notFound();
    }
}
