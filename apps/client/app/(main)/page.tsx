import { trpcServer } from "@/lib/trpc-server";
import { HomeFeedClient } from "./_components/home-feed-client";

export const dynamic = "force-dynamic";

export default async function Home() {
    // data is fetched on the server during SSR for instant visual hydration
    const initialFeed = await trpcServer.feed.getHomeFeed.query({});

    return (
        <div className="w-full h-full p-6 pb-24 overflow-y-auto font-sans">
            <h1 className="text-3xl font-black tracking-[calc(-0.02em*var(--font-sans))] uppercase mb-8 text-foreground/90">
                Recommended
            </h1>
            <HomeFeedClient initialData={initialFeed} />
        </div>
    );
}
