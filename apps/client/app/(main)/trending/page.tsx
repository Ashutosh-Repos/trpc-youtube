import { TrendingFeedClient } from "./_components/trending-feed-client";

export const dynamic = "force-dynamic";

export default function TrendingPage() {
    return (
        <div className="w-full h-full p-4 sm:p-6 pb-20 overflow-y-auto">
            <h1 className="text-2xl font-bold mb-4">Trending</h1>
            <TrendingFeedClient />
        </div>
    );
}
