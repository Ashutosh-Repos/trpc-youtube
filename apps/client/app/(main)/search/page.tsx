import { ResultsFeedClient } from "./_components/results-feed-client";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default function SearchResultsPage() {
    return (
        <div className="w-full h-full p-4 sm:p-6 pb-20 overflow-y-auto">
            <h1 className="text-2xl font-bold mb-4">Search Results</h1>
            <Suspense fallback={<div>Loading Search...</div>}>
                <ResultsFeedClient />
            </Suspense>
        </div>
    );
}
