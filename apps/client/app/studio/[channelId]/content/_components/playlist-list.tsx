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
            <div className="grid grid-cols-12 gap-4 px-8 py-5 border-b border-border/10 bg-background sticky top-0 z-20">
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
                            className="border-border/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary rounded-md h-5 w-5"
                        />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 ml-4">
                        {selectedIds.length > 0
                            ? `${selectedIds.length} Selected`
                            : "Playlist"}
                    </span>
                </div>
                <div className="col-span-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 flex items-center">
                    Visibility
                </div>
                <div className="col-span-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 flex items-center">
                    Last Updated
                </div>
                <div className="col-span-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 flex items-center justify-end pr-8">
                    Video Count
                </div>
            </div>

            {/* List Body */}
            <div className="divide-y divide-border/10">
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
