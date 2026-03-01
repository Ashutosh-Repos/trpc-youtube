"use client";

import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ContentTabsNavigation } from "../../_components/content-tabs-navigation";

export function ContentTabsLayoutClient({
    channelId,
    children,
}: {
    channelId: string;
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const isPlaylistsActive = pathname.endsWith("/playlists");

    const handleUploadClick = () => {
        toast.info("Upload flow coming soon!");
    };

    const handleCreatePlaylistClick = () => {
        // Just construct the URL manually to avoid strict window checks if hydration fails
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set("action", "createPlaylist");
        router.push(currentUrl.pathname + currentUrl.search, { scroll: false });
    };

    return (
        <div className="flex flex-col min-h-full h-full">
            <ContentTabsNavigation
                channelId={channelId}
                isPlaylistsActive={isPlaylistsActive}
                onUploadClick={handleUploadClick}
                onCreatePlaylistClick={handleCreatePlaylistClick}
            />

            {/* Content Area */}
            <div className="flex-1 w-full bg-surface-1">{children}</div>
        </div>
    );
}
