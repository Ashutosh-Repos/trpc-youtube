"use client";

import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { Upload, Loader2, AlertCircle, WifiOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useUploadStore } from "@/stores/upload-store";
import { useSession } from "@/lib/auth/auth-client";
import {
    Modal,
    ModalBody,
    ModalContent,
    ModalTrigger,
} from "../ui/animated-modal";
interface VideoUploadZoneProps {
    channelId: string;
    onUploadStarted?: (videoId: string) => void;
    className?: string;
}

export function VideoUploadZone({
    channelId,
    onUploadStarted,
    className,
}: VideoUploadZoneProps) {
    const {
        addFile,
        startUpload,
        status,
        error,
        reset,
        isOnline,
        overallProgress,
        file: currentFile,
        uploadId,
        recoverUpload,
        uploadRate,
        timeRemaining,
        abort,
    } = useUploadStore();
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { data: session } = useSession();

    const isRecoveryNeeded = !currentFile && !!uploadId;

    const handleDragOver = (e: DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = async (e: DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) await handleFileProcess(file);
    };

    const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) await handleFileProcess(file);
    };

    const handleFileProcess = async (file: File) => {
        // 1. Check if we are recovering
        if (!currentFile && uploadId) {
            // In recovery mode
            // We ideally should check if filename matches or ask user to confirm
            // For now, we assume user picked the right file if they clicked "Resume"
            await recoverUpload(file);
            return;
        }

        if (!file.type.startsWith("video/")) {
            alert("Please select a valid video file.");
            return;
        }

        // 2. Reset any previous state if not recovering
        reset();

        // 3. Auth Check
        if (!session) {
            alert("You must be logged in to upload.");
            return;
        }

        // 4. Init Upload
        await addFile(file, channelId);

        // 5. Start Upload automatically
        await startUpload();

        // Notify parent if needed
        const videoId = useUploadStore.getState().videoId;
        if (videoId && onUploadStarted) {
            onUploadStarted(videoId);
        }
    };

    const triggerSelect = () => {
        if (
            !isRecoveryNeeded &&
            (status === "uploading" ||
                status === "preparing" ||
                status === "hashing" ||
                status === "paused")
        ) {
            return;
        }
        fileInputRef.current?.click();
    };

    const isBusy =
        status === "uploading" ||
        status === "preparing" ||
        status === "hashing";
    const isPaused = status === "paused";

    return (
        <Modal>
            <ModalTrigger>
                <Button>Upload Video</Button>
            </ModalTrigger>
            <ModalBody className="border-0 bg-transparent!">
                <ModalContent>
                    <div className={cn("space-y-6 font-sans", className)}>
                        {!isOnline && (
                            <div className="flex items-center gap-3 p-4 rounded-2xl bg-secondary-brand/10 text-secondary-brand text-sm border border-secondary-brand/20 animate-in slide-in-from-top-2 duration-300">
                                <WifiOff className="h-4 w-4 shrink-0" />
                                <p className="font-bold tracking-tight">
                                    You are offline. Uploads will pause until
                                    connection is restored.
                                </p>
                            </div>
                        )}

                        <div
                            onDragOver={!isBusy ? handleDragOver : undefined}
                            onDragLeave={!isBusy ? handleDragLeave : undefined}
                            onDrop={!isBusy ? handleDrop : undefined}
                            onClick={!isBusy ? triggerSelect : undefined}
                            className={cn(
                                "relative flex flex-col items-center justify-center border-2 border-dashed rounded-[32px] transition-all duration-500 p-12 text-center",
                                isDragging
                                    ? "border-primary bg-primary/5 scale-[1.01] shadow-2xl shadow-primary/10"
                                    : "border-border/40 bg-surface-1/40 hover:border-primary/40 hover:bg-surface-1/60",
                                isBusy
                                    ? "cursor-not-allowed opacity-80 border-primary/20 bg-surface-2"
                                    : "cursor-pointer",
                                error
                                    ? "border-destructive/40 bg-destructive/5"
                                    : "",
                            )}
                        >
                            {isRecoveryNeeded ? (
                                <div className="flex flex-col items-center gap-5 animate-in fade-in zoom-in duration-500">
                                    <div className="p-5 rounded-full bg-secondary-brand/10 text-secondary-brand shadow-lg shadow-secondary-brand/5">
                                        <AlertCircle className="h-10 w-10" />
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-xl font-black tracking-tighter">
                                            Upload Interrupted
                                        </p>
                                        <p className="text-sm text-muted-foreground/80 max-w-xs mx-auto font-medium">
                                            We found an incomplete upload.
                                            Select the{" "}
                                            <span className="text-foreground font-bold">
                                                same file
                                            </span>{" "}
                                            to resume.
                                        </p>
                                    </div>
                                    <div className="flex gap-4 mt-2">
                                        <Button
                                            variant="ghost"
                                            onClick={() => reset()}
                                            className="rounded-xl border border-border/40 hover:bg-surface-2"
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            onClick={triggerSelect}
                                            className="rounded-xl bg-primary shadow-xl shadow-primary/20"
                                        >
                                            Select File to Resume
                                        </Button>
                                    </div>
                                </div>
                            ) : status === "preparing" ||
                              status === "hashing" ||
                              status === "uploading" ||
                              status === "paused" ? (
                                <div className="flex flex-col items-center gap-8 w-full max-w-sm animate-in fade-in zoom-in duration-500">
                                    {/* Circular Progress or Loader */}
                                    <div className="relative h-24 w-24 flex items-center justify-center">
                                        <svg
                                            className="absolute inset-0 h-full w-full -rotate-90"
                                            viewBox="0 0 36 36"
                                        >
                                            <path
                                                className="text-border/20"
                                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2.5"
                                            />
                                            <path
                                                className={cn(
                                                    "transition-all duration-700 ease-out drop-shadow-[0_0_8px_oklch(var(--primary)/0.4)]",
                                                    isPaused
                                                        ? "text-secondary-brand"
                                                        : "text-primary",
                                                )}
                                                strokeDasharray={`${overallProgress}, 100`}
                                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeLinecap="round"
                                                strokeWidth="2.5"
                                            />
                                        </svg>
                                        <div className="flex flex-col items-center justify-center">
                                            <span className="text-xl font-black tracking-tighter">
                                                {Math.round(overallProgress)}%
                                            </span>
                                        </div>
                                    </div>

                                    <div className="space-y-3 w-full text-center">
                                        <h3 className="font-black text-xl tracking-tighter">
                                            {status === "hashing"
                                                ? "Preparing Video..."
                                                : status === "paused"
                                                  ? "Upload Paused"
                                                  : "Uploading Video..."}
                                        </h3>
                                        <p className="text-[13px] text-muted-foreground/60 font-bold uppercase tracking-widest px-4">
                                            {status === "hashing"
                                                ? "Calculating secure hash for reliability..."
                                                : status === "paused"
                                                  ? "Resume to continue uploading"
                                                  : "Sending parts to server..."}
                                        </p>

                                        {(status === "uploading" ||
                                            isPaused) && (
                                            <div className="flex justify-center gap-4 text-[11px] text-muted-foreground/40 font-black tracking-widest uppercase tabular-nums">
                                                <span className="text-foreground/60">
                                                    {useUploadStore.getState()
                                                        .uploadRate > 0
                                                        ? `${(useUploadStore.getState().uploadRate / 1024 / 1024).toFixed(1)} MB/s`
                                                        : "-- MB/s"}
                                                </span>
                                                <span className="w-1 h-1 rounded-full bg-border/40 mt-1.5" />
                                                <span className="text-foreground/60">
                                                    {useUploadStore.getState()
                                                        .timeRemaining > 0
                                                        ? `${Math.ceil(useUploadStore.getState().timeRemaining)}s left`
                                                        : "Calculating..."}
                                                </span>
                                            </div>
                                        )}

                                        {/* Linear Progress Bar */}
                                        <div className="h-1.5 w-full bg-surface-2 rounded-full overflow-hidden mt-4 shadow-inner">
                                            <div
                                                className={cn(
                                                    "h-full transition-all duration-700 ease-out",
                                                    isPaused
                                                        ? "bg-secondary-brand shadow-[0_0_12px_oklch(var(--secondary-brand)/0.4)]"
                                                        : "bg-primary shadow-[0_0_12px_oklch(var(--primary)/0.4)]",
                                                )}
                                                style={{
                                                    width: `${overallProgress}%`,
                                                }}
                                            />
                                        </div>

                                        <div className="flex justify-center gap-3 pt-4">
                                            {isPaused ? (
                                                <Button
                                                    size="sm"
                                                    onClick={() =>
                                                        useUploadStore
                                                            .getState()
                                                            .resume()
                                                    }
                                                    className="rounded-xl bg-primary px-6 font-bold"
                                                >
                                                    Resume Upload
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    onClick={() =>
                                                        useUploadStore
                                                            .getState()
                                                            .pause()
                                                    }
                                                    className="rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/40 font-bold"
                                                >
                                                    Pause
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                onClick={() =>
                                                    useUploadStore
                                                        .getState()
                                                        .abort()
                                                }
                                                variant="ghost"
                                                className="rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 font-bold"
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-6 animate-in fade-in duration-700">
                                    <div className="p-6 rounded-[24px] bg-primary/10 text-primary shadow-xl shadow-primary/5 group-hover:scale-110 transition-transform duration-500">
                                        <Upload className="h-10 w-10" />
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-2xl font-black tracking-tighter">
                                            Select video files to upload
                                        </p>
                                        <p className="text-[13px] text-muted-foreground/60 font-bold uppercase tracking-widest">
                                            Your videos will be private until
                                            you publish them.
                                        </p>
                                    </div>
                                    <Button
                                        className="mt-2 rounded-2xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-primary-foreground px-8 font-black tracking-tight"
                                        disabled={isBusy}
                                    >
                                        Select Files
                                    </Button>
                                </div>
                            )}

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="video/*"
                                className="hidden"
                                onChange={handleFileSelect}
                                disabled={isBusy}
                            />
                        </div>

                        {error && (
                            <div className="flex items-center gap-4 p-4 rounded-2xl bg-destructive/10 text-destructive text-sm border border-destructive/20 animate-in shake duration-500">
                                <AlertCircle className="h-5 w-5 shrink-0" />
                                <p className="font-bold flex-1">{error}</p>
                                <div className="flex gap-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                            useUploadStore.getState().retry()
                                        }
                                        className="h-9 px-4 text-destructive hover:text-destructive hover:bg-destructive/20 font-black uppercase tracking-widest text-[11px]"
                                    >
                                        Retry
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => reset()}
                                        className="h-9 w-9 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/20"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}

                        <div className="text-center pt-2">
                            <p className="text-[10px] text-muted-foreground/40 uppercase tracking-[0.2em] font-black">
                                Max file size: 2GB • MP4, MOV, AVI supported
                            </p>
                        </div>
                    </div>
                </ModalContent>
            </ModalBody>
        </Modal>
    );
}
