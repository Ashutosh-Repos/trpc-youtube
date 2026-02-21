import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { trpcClient } from "@/lib/trpc-client";
import { toast } from "sonner";
import { UploadStats } from "@/lib/upload-stats";

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const CONCURRENCY = 3;
const MAX_RETRIES = 5;

// Web Worker for MD5 hashing
let hashWorker: Worker | null = null;

export type UploadStatus =
    | "idle"
    | "preparing"
    | "hashing" // New state for batch hashing
    | "uploading"
    | "paused"
    | "completing"
    | "success"
    | "error";

export interface PartState {
    partNumber: number;
    chunk: Blob;
    status:
        | "pending"
        | "hashing"
        | "hashed"
        | "uploading"
        | "completed"
        | "failed"
        | "retrying";
    etag?: string;
    md5?: string;
    attempts: number;
    progress: number;
}

export interface UploadState {
    videoId: string | null;
    uploadId: string | null;
    file: File | null;
    status: UploadStatus;
    parts: PartState[];
    overallProgress: number;
    uploadRate: number; // bytes per second
    timeRemaining: number; // seconds
    error: string | null;
    isOnline: boolean;
    chunkSize: number;

    // Actions
    addFile: (file: File, channelId: string) => Promise<void>;
    recoverUpload: (file: File) => Promise<void>;
    recoverUploadFromRow: (videoId: string, file: File) => Promise<void>;
    startUpload: () => Promise<void>;
    pause: () => void;
    resume: () => void;
    abort: () => Promise<void>;
    reset: () => void;
    setOnline: (isOnline: boolean) => void;
    retry: () => void;

    // Internal
    actions: {
        createParts: (file: File) => PartState[];
        processQueue: () => Promise<void>;
        complete: () => Promise<void>;
        fail: (error: string) => Promise<void>;
    };
}

// Helper to get worker instance
const getWorker = () => {
    if (typeof window === "undefined") return null;
    if (!hashWorker) {
        hashWorker = new Worker(
            new URL("../workers/hash.worker.ts", import.meta.url),
            { type: "module" },
        );
    }
    return hashWorker;
};

// Helper: Hash a chunk using the worker
const hashChunk = (id: number, chunk: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const worker = getWorker();
        if (!worker) return reject("Worker not available");

        const handler = (e: MessageEvent) => {
            if (e.data.id === id) {
                worker.removeEventListener("message", handler);
                if (e.data.error) reject(e.data.error);
                else resolve(e.data.md5);
            }
        };

        worker.addEventListener("message", handler);
        worker.postMessage({ id, chunk });
    });
};

const uploadStats = new UploadStats();

export const useUploadStore = create<UploadState>()(
    persist(
        (set, get) => ({
            videoId: null,
            uploadId: null,
            file: null,
            status: "idle",
            parts: [],
            overallProgress: 0,
            uploadRate: 0,
            timeRemaining: 0,
            error: null,
            isOnline: true,
            chunkSize: CHUNK_SIZE,

            setOnline: (isOnline) => {
                const prev = get().isOnline;
                set({ isOnline });

                if (!prev && isOnline && get().status === "paused") {
                    // Auto-resume if we were paused due to offline?
                    // Or just let user resume. Better to auto-resume if it was 'uploading' before?
                    // For now, simple state update.
                    if (get().file) {
                        toast.success("Back online. Resuming upload...");
                        get().startUpload();
                    }
                } else if (prev && !isOnline) {
                    toast.error("You are offline. Upload paused.");
                    if (
                        get().status === "uploading" ||
                        get().status === "hashing"
                    ) {
                        set({ status: "paused" });
                    }
                }
            },

            reset: () => {
                uploadStats.reset();
                set({
                    videoId: null,
                    uploadId: null,
                    file: null,
                    status: "idle",
                    parts: [],
                    overallProgress: 0,
                    uploadRate: 0,
                    timeRemaining: 0,
                    error: null,
                });
            },

            addFile: async (file, channelId) => {
                const { file: activeFile, status } = get();
                if (
                    activeFile &&
                    (status === "uploading" ||
                        status === "preparing" ||
                        status === "hashing")
                ) {
                    const confirm = window.confirm(
                        "You have an active upload. Do you want to cancel it and start a new one?",
                    );
                    if (!confirm) return;
                    get().reset(); // Cancel existing
                } else if (activeFile) {
                    get().reset();
                }

                set({
                    file,
                    status: "preparing",
                    error: null,
                    chunkSize: CHUNK_SIZE,
                });

                try {
                    // Generate Idempotency Key
                    // Hash: channelId + fileName + size + lastModified
                    const keyString = `${channelId}-${file.name}-${file.size}-${file.lastModified}`;
                    const idempotencyKey = btoa(keyString); // Simple base64 encoding for now, or use md5 worker if strict uniqueness needed

                    // ... existing logic
                    const initRes = await trpcClient.video.initUpload.mutate({
                        fileName: file.name,
                        channelId,
                        idempotencyKey,
                    });

                    const { videoId, uploadId } = initRes;

                    // If we got back an existing session, we might need to recover progress?
                    // For now, let's assume valid new or existing session.
                    // To be safe, we should probably check if parts exist if it was an existing session...
                    // But initUpload returns success, so we proceed.

                    const parts = useUploadStore
                        .getState()
                        .actions.createParts(file);

                    set({ videoId, uploadId, parts, status: "idle" });
                    get().startUpload();
                } catch (error: unknown) {
                    const msg =
                        error instanceof Error
                            ? error.message
                            : "Unknown error";
                    set({ status: "error", error: msg });
                }
            },

            recoverUpload: async (file: File) => {
                const { videoId, uploadId, parts } = get();
                if (!videoId || !uploadId) return;

                // validate chunk size
                if (get().chunkSize !== CHUNK_SIZE) {
                    toast.error("Chunk size changed. Cannot resume upload.");
                    get().reset();
                    return;
                }

                set({ file, status: "preparing", error: null });

                try {
                    // SYNC WITH SERVER
                    // Verify if the upload session is still valid and get actual uploaded parts
                    const serverState =
                        await trpcClient.video.resumeUpload.query({ videoId });

                    if (serverState.uploadId !== uploadId) {
                        throw new Error(
                            "Upload session mismatch. Please restart.",
                        );
                    }

                    const serverParts = new Set(
                        serverState.parts.map((p) => p.PartNumber),
                    );

                    // Re-create chunks (since Blobs are lost on reload)
                    const newParts = useUploadStore
                        .getState()
                        .actions.createParts(file);

                    // Merge and Reconcile Status
                    const mergedParts = newParts.map((np) => {
                        const existing = parts.find(
                            (p) => p.partNumber === np.partNumber,
                        );

                        // If server has it, it is COMPLETED. Source of Truth.
                        if (serverParts.has(np.partNumber)) {
                            return {
                                ...np,
                                status: "completed" as const,
                                progress: 100,
                                etag:
                                    existing?.etag ||
                                    serverState.parts.find(
                                        (p) => p.PartNumber === np.partNumber,
                                    )?.ETag,
                                md5: existing?.md5, // Keep local MD5 if we had it
                                attempts: existing?.attempts || 0,
                            };
                        }

                        // If not on server, check local state
                        if (existing) {
                            // If local thought it was completed but server doesn't have it -> DOWNGRADE to pending
                            if (existing.status === "completed") {
                                return {
                                    ...np,
                                    status: "pending" as const,
                                    md5: existing.md5, // Keep MD5 to avoid re-hashing if possible
                                    attempts: 0,
                                };
                            }

                            // If partial/active, reset to pending
                            if (
                                existing.status === "uploading" ||
                                existing.status === "hashing"
                            ) {
                                return {
                                    ...np,
                                    status: "pending" as const,
                                    md5: existing.md5,
                                    attempts: existing.attempts,
                                };
                            }

                            // Keep hashed/pending/failed status
                            return {
                                ...np,
                                status: existing.status,
                                md5: existing.md5,
                                attempts: existing.attempts,
                            };
                        }

                        return np;
                    });

                    set({ parts: mergedParts, status: "idle" });
                    get().startUpload();
                    toast.success("Upload session recovered!");
                } catch (err: unknown) {
                    console.error("Failed to recover upload:", err);
                    const msg =
                        err instanceof Error ? err.message : "Unknown error";
                    toast.error(
                        `Recovery failed: ${msg}. Please restart upload.`,
                    );
                    get().reset();
                }
            },

            recoverUploadFromRow: async (videoId: string, file: File) => {
                const { status } = get();
                if (status === "uploading" || status === "hashing") {
                    const confirm = window.confirm(
                        "You have an active upload running. Do you want to pause it and resume this one instead?",
                    );
                    if (!confirm) return;
                    get().pause();
                }

                if (get().chunkSize !== CHUNK_SIZE) {
                    toast.error("Chunk size changed. Cannot resume upload.");
                    get().reset();
                    return;
                }

                set({ file, videoId, status: "preparing", error: null });

                try {
                    // Fetch real S3 true state directly from backend
                    const serverState =
                        await trpcClient.video.resumeUpload.query({ videoId });

                    const serverParts = new Set(
                        serverState.parts.map((p) => p.PartNumber),
                    );

                    // Re-create memory chunks from selected file
                    const newParts = useUploadStore
                        .getState()
                        .actions.createParts(file);

                    // Merge: If server has it, it's complete. Otherwise pending.
                    const mergedParts = newParts.map((np) => {
                        if (serverParts.has(np.partNumber)) {
                            return {
                                ...np,
                                status: "completed" as const,
                                progress: 100,
                                etag: serverState.parts.find(
                                    (p) => p.PartNumber === np.partNumber,
                                )?.ETag,
                                attempts: 0,
                            };
                        }
                        return np;
                    });

                    // Calculate progress based on merged state
                    const totalUploaded = mergedParts.reduce(
                        (acc, p) =>
                            acc + (p.status === "completed" ? CHUNK_SIZE : 0),
                        0,
                    );
                    const overallProgress = (totalUploaded / file.size) * 100;

                    set({
                        uploadId: serverState.uploadId,
                        parts: mergedParts,
                        overallProgress: Math.min(overallProgress, 99),
                        status: "idle",
                    });

                    get().startUpload();
                    toast.success("Upload session recovered from server!");
                } catch (err: unknown) {
                    console.error("Failed to recover upload from row:", err);
                    const msg =
                        err instanceof Error ? err.message : "Unknown error";
                    toast.error(
                        `Recovery failed: ${msg}. Try deleting the video and starting over.`,
                    );
                    get().reset();
                }
            },

            startUpload: async () => {
                const { status, videoId, uploadId, isOnline } = get();
                if (!videoId || !uploadId || !isOnline) return;
                if (status === "uploading" || status === "hashing") return;

                set({ status: "uploading" });
                get().actions.processQueue();
            },

            pause: () => {
                set({ status: "paused" });
            },

            resume: () => {
                get().startUpload();
            },

            retry: () => {
                set((state) => ({
                    status: "idle",
                    error: null,
                    parts: state.parts.map((p) =>
                        p.status === "failed"
                            ? { ...p, status: "pending", attempts: 0 }
                            : p,
                    ),
                }));
                get().startUpload();
            },

            abort: async () => {
                const { videoId, uploadId } = get();
                if (videoId && uploadId) {
                    try {
                        await trpcClient.video.abortUpload.mutate({
                            uploadId,
                            videoId,
                        });
                    } catch (e) {
                        console.error("Abort failed", e);
                    }
                }
                get().reset();
            },

            actions: {
                createParts: (file: File) => {
                    const parts: PartState[] = [];
                    let partNumber = 1;
                    for (
                        let offset = 0;
                        offset < file.size;
                        offset += CHUNK_SIZE
                    ) {
                        parts.push({
                            partNumber: partNumber++,
                            chunk: file.slice(offset, offset + CHUNK_SIZE),
                            status: "pending",
                            attempts: 0,
                            progress: 0,
                        });
                    }
                    return parts;
                },

                processQueue: async () => {
                    const state = get();
                    if (
                        state.status !== "uploading" &&
                        state.status !== "hashing"
                    )
                        return;
                    if (!state.isOnline) return;

                    // 1. Identify pending parts
                    const pendingParts = state.parts.filter(
                        (p) => p.status === "pending",
                    );
                    const hashingParts = state.parts.filter(
                        (p) => p.status === "hashing",
                    );
                    const hashedParts = state.parts.filter(
                        (p) => p.status === "hashed",
                    );
                    const uploadingParts = state.parts.filter(
                        (p) => p.status === "uploading",
                    );

                    // Check completion
                    const allDone = state.parts.every(
                        (p) => p.status === "completed",
                    );
                    if (allDone) {
                        await get().actions.complete();
                        return;
                    }

                    // Check failures
                    if (state.parts.some((p) => p.status === "failed")) {
                        await get().actions.fail(
                            "Some parts failed permanently.",
                        );
                        return;
                    }

                    // ---------------------------------------------------------
                    // PIPELINE: Hashing -> Pre-Signing -> Uploading
                    // ---------------------------------------------------------

                    // A. Setup Batch Hashing if needed
                    // Maintain a buffer of hashed parts ready for upload
                    const desiredHashed = CONCURRENCY * 2;
                    if (
                        pendingParts.length > 0 &&
                        hashingParts.length + hashedParts.length < desiredHashed
                    ) {
                        // Take next batch to hash
                        const toHash = pendingParts.slice(0, CONCURRENCY);

                        // Update status
                        set((s) => ({
                            parts: s.parts.map((p) =>
                                toHash.find(
                                    (th) => th.partNumber === p.partNumber,
                                )
                                    ? { ...p, status: "hashing" }
                                    : p,
                            ),
                        }));

                        // Trigger Workers
                        toHash.forEach((part) => {
                            hashChunk(part.partNumber, part.chunk)
                                .then((md5) => {
                                    set((s) => ({
                                        parts: s.parts.map((p) =>
                                            p.partNumber === part.partNumber
                                                ? {
                                                      ...p,
                                                      status: "hashed",
                                                      md5,
                                                  }
                                                : p,
                                        ),
                                    }));
                                    // Trigger queue again to move to upload step
                                    get().actions.processQueue();
                                })
                                .catch((err) => {
                                    console.error("Hash failed", err);
                                    // Should probably retry or fail part
                                    // For now, reset to pending to retry
                                    set((s) => ({
                                        parts: s.parts.map((p) =>
                                            p.partNumber === part.partNumber
                                                ? { ...p, status: "pending" }
                                                : p,
                                        ),
                                    }));
                                });
                        });
                    }

                    // B. Batch Get URLs & Upload
                    // Ensure we respect concurrency for actual network uploads
                    if (
                        uploadingParts.length < CONCURRENCY &&
                        hashedParts.length > 0
                    ) {
                        // Take as many as we can fit
                        const slots = CONCURRENCY - uploadingParts.length;
                        const toUpload = hashedParts.slice(0, slots);

                        if (toUpload.length === 0) return;

                        // Mark as uploading
                        set((s) => ({
                            parts: s.parts.map((p) =>
                                toUpload.find(
                                    (tu) => tu.partNumber === p.partNumber,
                                )
                                    ? { ...p, status: "uploading" }
                                    : p,
                            ),
                        }));

                        // Fetch URLs in Batch
                        try {
                            const { urls } =
                                await trpcClient.video.getPartUrls.mutate({
                                    uploadId: state.uploadId!,
                                    videoId: state.videoId!,
                                    parts: toUpload.map((p) => ({
                                        partNumber: p.partNumber,
                                        md5: p.md5,
                                    })),
                                });

                            // Parallel Uploads to S3
                            toUpload.forEach((part) => {
                                const urlData = urls.find(
                                    (u) => u.partNumber === part.partNumber,
                                );
                                if (!urlData) return; // Should not happen

                                fetch(urlData.url, {
                                    method: "PUT",
                                    body: part.chunk,
                                    headers: {
                                        "Content-Type":
                                            "application/octet-stream",
                                        "Content-MD5": part.md5!,
                                    },
                                })
                                    .then(async (res) => {
                                        if (!res.ok)
                                            throw new Error("S3 Upload Failed");
                                        const etag = res.headers
                                            .get("ETag")
                                            ?.replace(/"/g, "");
                                        if (!etag) throw new Error("No ETag");

                                        // Complete
                                        set((s) => {
                                            const nextParts = s.parts.map(
                                                (p) =>
                                                    p.partNumber ===
                                                    part.partNumber
                                                        ? {
                                                              ...p,
                                                              status: "completed" as const,
                                                              etag,
                                                              progress: 100,
                                                          }
                                                        : p,
                                            );

                                            // Handle last chunk size correctly?
                                            // Simplification: just use CHUNK_SIZE for all completed
                                            // Real calculation would need p.chunk.size

                                            let realUploadedBytes = 0;
                                            nextParts.forEach((p) => {
                                                if (p.status === "completed") {
                                                    realUploadedBytes +=
                                                        p.chunk.size;
                                                }
                                            });

                                            uploadStats.update(
                                                realUploadedBytes,
                                            );

                                            const overall =
                                                (realUploadedBytes /
                                                    (s.file?.size || 1)) *
                                                100;

                                            return {
                                                parts: nextParts,
                                                overallProgress: overall,
                                                uploadRate:
                                                    uploadStats.getSpeed(),
                                                timeRemaining:
                                                    uploadStats.getTimeRemaining(
                                                        s.file?.size || 0,
                                                    ),
                                            };
                                        });

                                        // Next!
                                        get().actions.processQueue();
                                    })
                                    .catch((err) => {
                                        console.error("Upload failed", err);
                                        const newAttempts = part.attempts + 1;

                                        if (newAttempts >= MAX_RETRIES) {
                                            set((s) => ({
                                                parts: s.parts.map((p) =>
                                                    p.partNumber ===
                                                    part.partNumber
                                                        ? {
                                                              ...p,
                                                              status: "failed",
                                                              attempts:
                                                                  newAttempts,
                                                          }
                                                        : p,
                                                ),
                                            }));
                                            get().actions.fail(
                                                `Part ${part.partNumber} failed permanently.`,
                                            );
                                        }

                                        // Mark as RETRYING so processQueue ignores it during backoff
                                        set((s) => ({
                                            parts: s.parts.map((p) =>
                                                p.partNumber === part.partNumber
                                                    ? {
                                                          ...p,
                                                          status: "retrying",
                                                          attempts: newAttempts,
                                                      }
                                                    : p,
                                            ),
                                        }));

                                        const delay =
                                            1000 * Math.pow(2, newAttempts);

                                        setTimeout(() => {
                                            set((s) => ({
                                                parts: s.parts.map((p) =>
                                                    p.partNumber ===
                                                        part.partNumber &&
                                                    p.status === "retrying"
                                                        ? {
                                                              ...p,
                                                              status: "hashed",
                                                          }
                                                        : p,
                                                ),
                                            }));
                                            get().actions.processQueue();
                                        }, delay);
                                    });
                            });
                        } catch (err) {
                            console.error("Failed to get batch URLs", err);
                            // Reset to hashed to retry getting URLs
                            set((s) => ({
                                parts: s.parts.map((p) =>
                                    toUpload.find(
                                        (tu) => tu.partNumber === p.partNumber,
                                    )
                                        ? { ...p, status: "hashed" }
                                        : p,
                                ),
                            }));
                            // Retry later
                            setTimeout(() => {
                                get().actions.processQueue();
                            }, 5000);
                        }
                    }
                },

                complete: async () => {
                    const { videoId, uploadId, parts } = get();
                    if (!videoId || !uploadId) return;

                    set({ status: "completing" });

                    try {
                        await trpcClient.video.completeUpload.mutate({
                            uploadId,
                            videoId,
                            parts: parts.map((p) => ({
                                PartNumber: p.partNumber,
                                ETag: p.etag!,
                            })),
                        });
                        set({ status: "success", overallProgress: 100 });
                        toast.success("Upload complete! Processing video...");
                    } catch (e: unknown) {
                        const msg =
                            e instanceof Error
                                ? e.message
                                : "An error occurred";
                        set({ status: "error", error: msg });
                    }
                },

                fail: async (error) => {
                    set({ status: "error", error });
                    const { videoId } = get();
                    if (videoId) {
                        try {
                            await trpcClient.video.reportFailure.mutate({
                                error,
                                videoId,
                            });
                        } catch {}
                    }
                },
            },
        }),
        {
            name: "upload-storage",
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                videoId: state.videoId,
                uploadId: state.uploadId,
                status:
                    state.status === "hashing" || state.status === "uploading"
                        ? "paused"
                        : state.status, // Don't persist active states
                parts: state.parts.map((p) => ({
                    partNumber: p.partNumber,
                    status:
                        p.status === "uploading" || p.status === "hashing"
                            ? "pending"
                            : p.status, // Reset active parts
                    etag: p.etag,
                    md5: p.md5,
                    progress: p.progress,
                })),
                overallProgress: state.overallProgress,
                chunkSize: state.chunkSize,
            }),
        },
    ),
);

// Global Network Listeners
if (typeof window !== "undefined") {
    window.addEventListener("online", () =>
        useUploadStore.getState().setOnline(true),
    );
    window.addEventListener("offline", () =>
        useUploadStore.getState().setOnline(false),
    );
}
