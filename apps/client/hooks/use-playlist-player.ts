import { create } from "zustand";

export interface PlaylistVideo {
    id: string;
    title: string;
    duration: number | null;
    thumbnailUrl: string | null;
    channelName: string | null;
    channelHandle: string | null;
    position: number;
}

export interface PlaylistData {
    id: string;
    title: string;
    authorName: string | null;
    authorHandle: string | null;
    videos: PlaylistVideo[];
}

interface PlaylistPlayerState {
    playlistId: string | null;
    playlistData: PlaylistData | null;
    isShuffled: boolean;
    isLooped: boolean;
    currentIndex: number;
    shuffledOrder: number[];
    isInitialized: boolean;

    // Actions
    initializePlaylist: (data: PlaylistData, startVideoId?: string) => void;
    toggleShuffle: () => void;
    toggleLoop: () => void;
    next: () => string | null; // Returns internal video ID for navigation
    previous: () => string | null;
    setCurrentIndex: (index: number) => void;
    clear: () => void;
}

export const usePlaylistPlayerStore = create<PlaylistPlayerState>(
    (set, get) => ({
        playlistId: null,
        playlistData: null,
        isShuffled: false,
        isLooped: false,
        currentIndex: 0,
        shuffledOrder: [],
        isInitialized: false,

        initializePlaylist: (data, startVideoId) => {
            const videos = data.videos;
            if (videos.length === 0) return;

            let initialIndex = 0;
            if (startVideoId) {
                const foundIndex = videos.findIndex(
                    (v) => v.id === startVideoId,
                );
                if (foundIndex !== -1) initialIndex = foundIndex;
            }

            set({
                playlistId: data.id,
                playlistData: data,
                currentIndex: initialIndex,
                isShuffled: false,
                shuffledOrder: Array.from(
                    { length: videos.length },
                    (_, i) => i,
                ),
                isInitialized: true,
            });
        },

        toggleShuffle: () => {
            const { isShuffled, playlistData, currentIndex, shuffledOrder } =
                get();
            if (!playlistData) return;

            if (isShuffled) {
                // Unshuffle: Revert to standard order but keep current index aligned
                const currentVideoId =
                    playlistData.videos[shuffledOrder[currentIndex]].id;
                const newIndex = playlistData.videos.findIndex(
                    (v) => v.id === currentVideoId,
                );
                set({
                    isShuffled: false,
                    shuffledOrder: Array.from(
                        { length: playlistData.videos.length },
                        (_, i) => i,
                    ),
                    currentIndex: Math.max(0, newIndex),
                });
            } else {
                // Shuffle
                const newOrder = Array.from(
                    { length: playlistData.videos.length },
                    (_, i) => i,
                );
                // Fisher-Yates
                for (let i = newOrder.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [newOrder[i], newOrder[j]] = [newOrder[j], newOrder[i]];
                }

                // Move the currently playing video to index 0 of the shuffled array so play continues cleanly
                const currentPlayingAbsoluteIndex = currentIndex;
                const shuffledIndexOfCurrent = newOrder.indexOf(
                    currentPlayingAbsoluteIndex,
                );

                // Swap
                const temp = newOrder[0];
                newOrder[0] = currentPlayingAbsoluteIndex;
                newOrder[shuffledIndexOfCurrent] = temp;

                set({
                    isShuffled: true,
                    shuffledOrder: newOrder,
                    currentIndex: 0,
                });
            }
        },

        toggleLoop: () => set((state) => ({ isLooped: !state.isLooped })),

        next: () => {
            const { playlistData, currentIndex, isLooped, shuffledOrder } =
                get();
            if (!playlistData) return null;

            const maxIndex = shuffledOrder.length - 1;
            let nextIndex = currentIndex + 1;

            if (nextIndex > maxIndex) {
                if (isLooped) {
                    nextIndex = 0;
                } else {
                    return null; // Reached end of unlooped playlist
                }
            }

            set({ currentIndex: nextIndex });
            return playlistData.videos[shuffledOrder[nextIndex]].id;
        },

        previous: () => {
            const { playlistData, currentIndex, isLooped, shuffledOrder } =
                get();
            if (!playlistData) return null;

            let prevIndex = currentIndex - 1;

            if (prevIndex < 0) {
                if (isLooped) {
                    prevIndex = shuffledOrder.length - 1;
                } else {
                    // If not looped and at the beginning, stay at index 0 and replay
                    set({ currentIndex: 0 });
                    return playlistData.videos[shuffledOrder[0]].id;
                }
            }

            set({ currentIndex: prevIndex });
            return playlistData.videos[shuffledOrder[prevIndex]].id;
        },

        setCurrentIndex: (index) => set({ currentIndex: index }),

        clear: () =>
            set({
                playlistId: null,
                playlistData: null,
                isShuffled: false,
                isLooped: false,
                shuffledOrder: [],
                currentIndex: 0,
                isInitialized: false,
            }),
    }),
);
