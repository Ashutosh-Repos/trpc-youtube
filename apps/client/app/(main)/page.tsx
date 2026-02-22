import { trpcServer } from "../../lib/trpc-server";
import { HomeFeedClient } from "./_components/home-feed-client";

export const dynamic = "force-dynamic";

export default async function Home() {
    // data is fetched on the server during SSR (optional initial seed)
    // const hello = await trpcServer.hello.query({ name: "Next.js Server" });

    return (
        <div className="w-full h-full p-4 sm:p-6 pb-20 overflow-y-auto">
            <h1 className="text-2xl font-bold mb-4">Recommended</h1>
            <HomeFeedClient />
        </div>
    );
}
