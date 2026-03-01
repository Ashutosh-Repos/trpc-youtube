import type { Metadata } from "next";
import { HistoryClient } from "./client";

import { trpcServer } from "@/lib/trpc-server";

export const metadata: Metadata = {
    title: "Watch History - YouTube",
    description: "View and manage your watch history",
};

export default async function HistoryPage() {
    const initialData = await trpcServer.history.getHistory.query({
        limit: 20,
    });
    return <HistoryClient initialData={initialData} />;
}
