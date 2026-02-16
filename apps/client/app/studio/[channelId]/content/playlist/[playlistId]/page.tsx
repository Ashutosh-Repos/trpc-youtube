"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ListVideo } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PlaylistVideoRow } from "../../_components/playlist-video-row";
import { toast } from "sonner";
import {
    DragDropContext,
    Droppable,
    Draggable,
    DropResult,
} from "@hello-pangea/dnd";

export default function PlaylistDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const playlistId = params.playlistId as string;
    const channelId = params.channelId as string;
    const utils = trpc.useUtils();

    const videosQuery = trpc.playlist.getPlaylistVideos.useQuery({
        playlistId,
        channelId,
    });

    const reorderMutation = trpc.playlist.reorderPlaylistVideos.useMutation({
        onError: () => {
            toast.error("Failed to save new order");
            videosQuery.refetch();
        },
    });

    const videos = videosQuery.data?.videos ?? [];
    const loading = videosQuery.isLoading;

    const onDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        if (result.source.index === result.destination.index) return;

        const movedVideo = videos[result.source.index];
        const newPosition = result.destination.index;

        // Optimistic local reorder
        const items = Array.from(videos) as any[];
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);

        const updatedItems = items.map((item: any, index: number) => ({
            ...item,
            position: index,
        }));

        // Update React Query cache optimistically
        utils.playlist.getPlaylistVideos.setData(
            { playlistId, channelId },
            (old: any) => (old ? { ...old, items: updatedItems } : old),
        );

        // Sync with server (single video move)
        reorderMutation.mutate({
            playlistId,
            channelId,
            videoId: movedVideo.id,
            newPosition,
        });
    };

    return (
        <div className="flex flex-col h-full bg-[#0f0f0f] text-white">
            {/* Header */}
            <div className="p-6 border-b border-white/5 bg-[#0f0f0f]/50 backdrop-blur-md sticky top-0 z-10">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.back()}
                            className="rounded-full hover:bg-white/10"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">
                                Playlist Content
                            </h1>
                            <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest mt-1">
                                {videos.length} Videos • Managed by you
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-auto">
                <div className="max-w-6xl mx-auto py-8 px-6">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-[400px] gap-4">
                            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                            <p className="text-zinc-500 font-bold text-xs uppercase tracking-widest">
                                Loading playlist content...
                            </p>
                        </div>
                    ) : videos.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[400px] gap-6 text-center">
                            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center text-zinc-500">
                                <ListVideo className="w-10 h-10" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-xl font-bold">
                                    This playlist is empty
                                </h2>
                                <p className="text-zinc-500 text-sm max-w-xs mx-auto">
                                    Add videos from your content library to
                                    start organizing your playlist.
                                </p>
                            </div>
                            <Button
                                onClick={() =>
                                    router.push(`/studio/${channelId}/content`)
                                }
                                className="bg-primary text-black font-bold hover:bg-primary/90"
                            >
                                Go to Content library
                            </Button>
                        </div>
                    ) : (
                        <div className="bg-[#16161a] rounded-xl border border-white/5 overflow-hidden shadow-2xl">
                            <div className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-white/5 bg-white/5 items-center">
                                <div className="col-span-1 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                                    #
                                </div>
                                <div className="col-span-8 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                                    Video
                                </div>
                                <div className="col-span-3 text-right text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                                    Actions
                                </div>
                            </div>

                            <DragDropContext onDragEnd={onDragEnd}>
                                <Droppable droppableId="playlist-videos">
                                    {(provided) => (
                                        <div
                                            {...provided.droppableProps}
                                            ref={provided.innerRef}
                                            className="divide-y divide-white/5"
                                        >
                                            {videos.map(
                                                (video: any, index: number) => (
                                                    <Draggable
                                                        key={video.id}
                                                        draggableId={video.id}
                                                        index={index}
                                                    >
                                                        {(provided) => (
                                                            <PlaylistVideoRow
                                                                playlistId={
                                                                    playlistId
                                                                }
                                                                video={video}
                                                                onRemove={() => {
                                                                    utils.playlist.getPlaylistVideos.invalidate();
                                                                }}
                                                                provided={
                                                                    provided
                                                                }
                                                            />
                                                        )}
                                                    </Draggable>
                                                ),
                                            )}
                                            {provided.placeholder}
                                        </div>
                                    )}
                                </Droppable>
                            </DragDropContext>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
