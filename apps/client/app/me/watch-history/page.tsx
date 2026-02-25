import type { Metadata } from "next";
import { HistoryClient } from "./client";

export const metadata: Metadata = {
    title: "Watch History - YouTube",
    description: "View and manage your watch history",
};

export default function HistoryPage() {
    return <HistoryClient />;
}
