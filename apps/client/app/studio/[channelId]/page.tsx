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

    let result;
    try {
        result = await trpcServer.channel.getChannelById.query({
            channelId,
        });
    } catch (error: unknown) {
        if (
            typeof error === "object" &&
            error !== null &&
            "data" in error &&
            (error as { data: { code: string } }).data.code === "UNAUTHORIZED"
        ) {
            redirect("/login");
        }
        notFound();
    }

    const { channel } = result;

    return (
        <div className="p-8 space-y-8">
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="text-4xl font-black tracking-tighter uppercase text-foreground/90">
                        Dashboard
                    </h1>
                    <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/40 mt-1">
                        Manage videos and performance for{" "}
                        <span className="text-primary">{channel.name}</span>
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-2">
                    <VideoUploadZone channelId={channelId} />
                </div>

                <div className="bg-surface-1 border border-border/10 rounded-2xl p-8 h-fit shadow-xl">
                    <h2 className="text-[11px] font-black uppercase tracking-widest text-foreground/40 mb-6">
                        Channel Analytics
                    </h2>
                    <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-border/10 rounded-xl bg-surface-2/50">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 italic">
                            Analytics data will be available here soon
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
