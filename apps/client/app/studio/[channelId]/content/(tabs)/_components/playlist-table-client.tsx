"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { RouterOutputs } from "@/lib/trpc-shared";

import { PlaylistList } from "../../_components/playlist-list";
import { PlaylistFormModal } from "../../_components/playlist-form-modal";
import { Button } from "@/components/ui/button";
import { ListVideo } from "lucide-react";

interface PlaylistTableClientProps {
    channelId: string;
    initialData: RouterOutputs["playlist"]["getChannelPlaylists"];
}

export function PlaylistTableClient({
    channelId,
    initialData,
}: PlaylistTableClientProps) {
    const utils = trpc.useUtils();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    // Modal State
    const action = searchParams.get("action");
    const isPlaylistModalOpen =
        action === "createPlaylist" || action === "editPlaylist";

    const [editingPlaylist, setEditingPlaylist] = useState<
        | RouterOutputs["playlist"]["getChannelPlaylists"]["playlists"][number]
        | null
    >(null);

    // Keep state sync'd with URL Action
    useEffect(() => {
        if (action !== "editPlaylist") {
            setEditingPlaylist(null);
        }
    }, [action]);

    const playlistsQuery = trpc.playlist.getChannelPlaylists.useQuery(
        { channelId },
        {
            initialData,
            refetchOnMount: false,
        },
    );

    const playlists = playlistsQuery.data?.playlists ?? [];

    const toggleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(playlists.map((i) => i.id));
        } else {
            setSelectedIds([]);
        }
    };

    const toggleSelect = (id: string, checked: boolean) => {
        if (checked) {
            setSelectedIds((prev) => [...prev, id]);
        } else {
            setSelectedIds((prev) => prev.filter((i) => i !== id));
        }
    };

    const closeModal = () => {
        const url = new URL(window.location.href);
        url.searchParams.delete("action");
        router.replace(url.pathname + url.search, { scroll: false });
        setEditingPlaylist(null);
    };

    const openEditModal = (
        p: RouterOutputs["playlist"]["getChannelPlaylists"]["playlists"][number],
    ) => {
        setEditingPlaylist(p);
        const url = new URL(window.location.href);
        url.searchParams.set("action", "editPlaylist");
        router.push(url.pathname + url.search, { scroll: false });
    };

    return (
        <div className="flex flex-col h-full bg-background w-full min-w-[1000px]">
            <div className="flex-1 overflow-auto custom-scrollbar">
                {playlists.length === 0 && !playlistsQuery.isLoading ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-20 space-y-6">
                        <div className="w-24 h-24 rounded-3xl bg-surface-2 flex items-center justify-center -rotate-3 hover:rotate-0 transition-transform duration-500 shadow-xl border border-border/10">
                            <ListVideo className="w-10 h-10 text-muted-foreground/20" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-3xl font-black tracking-tighter uppercase text-foreground/90 leading-tight">
                                No playlists yet
                            </h3>
                            <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/40 max-w-sm mx-auto">
                                Playlists are a great way to group videos
                                together for your viewers and keep them engaged.
                            </p>
                        </div>
                        <Button
                            className="bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest text-[11px] h-12 px-10 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95 flex items-center gap-3"
                            onClick={() => {
                                const url = new URL(window.location.href);
                                url.searchParams.set(
                                    "action",
                                    "createPlaylist",
                                );
                                router.push(url.pathname + url.search, {
                                    scroll: false,
                                });
                            }}
                        >
                            <ListVideo className="w-4 h-4" /> Create playlist
                        </Button>
                    </div>
                ) : (
                    <PlaylistList
                        playlists={playlists}
                        selectedIds={selectedIds}
                        onSelect={(id, checked) => toggleSelect(id, checked)}
                        onSelectAll={(checked) => toggleSelectAll(checked)}
                        onEdit={(p) => openEditModal(p)}
                    />
                )}
            </div>

            <PlaylistFormModal
                channelId={channelId}
                playlist={editingPlaylist || undefined}
                isOpen={isPlaylistModalOpen}
                onClose={closeModal}
                onSuccess={() => {
                    utils.playlist.getChannelPlaylists.invalidate();
                }}
            />
        </div>
    );
}
