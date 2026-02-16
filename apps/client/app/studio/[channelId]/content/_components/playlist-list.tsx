"use client";

import { PlaylistRow } from "./playlist-row";
import { VideoIcon, ListVideo } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { RouterOutputs } from "@/lib/trpc-shared";

interface PlaylistListProps {
    playlists: RouterOutputs["playlist"]["getChannelPlaylists"]["playlists"];
    selectedIds: string[];
    onSelect: (id: string, checked: boolean) => void;
    onSelectAll: (checked: boolean) => void;
    onEdit?: (
        playlist: RouterOutputs["playlist"]["getChannelPlaylists"]["playlists"][number],
    ) => void;
}

export const PlaylistList = ({
    playlists,
    selectedIds,
    onSelect,
    onSelectAll,
    onEdit,
}: PlaylistListProps) => {
    return (
        <div className="w-full min-w-[1000px]">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-white/5 bg-[#0f0f0f] sticky top-0 z-20">
                <div className="col-span-6 flex gap-4">
                    <div className="flex items-center">
                        <Checkbox
                            checked={
                                selectedIds.length === playlists.length &&
                                playlists.length > 0
                            }
                            onCheckedChange={(checked) =>
                                onSelectAll(!!checked)
                            }
                            className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest text-zinc-500 ml-4">
                        Playlist
                    </span>
                </div>
                <div className="col-span-2 text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center">
                    Visibility
                </div>
                <div className="col-span-2 text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center">
                    Last Updated
                </div>
                <div className="col-span-2 text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center justify-end pr-6">
                    Videos
                </div>
            </div>

            {/* List Body */}
            <div className="divide-y divide-white/5">
                {playlists.map((playlist) => (
                    <PlaylistRow
                        key={playlist.id}
                        playlist={playlist}
                        isSelected={selectedIds.includes(playlist.id)}
                        onSelect={(checked) => onSelect(playlist.id, checked)}
                        onEdit={onEdit}
                    />
                ))}
            </div>
        </div>
    );
};
