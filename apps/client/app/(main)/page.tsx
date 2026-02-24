import { HomeFeedClient } from "./_components/home-feed-client";

export const dynamic = "force-dynamic";

export default async function Home() {
    // data is fetched on the server during SSR (optional initial seed)
    // const hello = await trpcServer.hello.query({ name: "Next.js Server" });

    return (
        <div className="w-full h-full p-6 pb-24 overflow-y-auto font-sans">
            <h1 className="text-3xl font-black tracking-[calc(-0.02em*var(--font-sans))] uppercase mb-8 text-foreground/90">
                Recommended
            </h1>
            <HomeFeedClient />
        </div>
    );
}
