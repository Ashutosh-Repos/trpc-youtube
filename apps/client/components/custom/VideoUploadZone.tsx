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
            status === "uploading" ||
            status === "preparing" ||
            status === "hashing" ||
            status === "paused"
        )
            return;
        fileInputRef.current?.click();
    };

    const isBusy =
        status === "uploading" ||
        status === "preparing" ||
        status === "hashing";
    const isPaused = status === "paused";
    const isRecoveryNeeded = !currentFile && !!uploadId;

    return (
        <Modal>
            <ModalTrigger>
                <Button>Upload Video</Button>
            </ModalTrigger>
            <ModalBody className="border-0 bg-transparent!">
                <ModalContent>
                    <div className={cn("space-y-4", className)}>
                        {!isOnline && (
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 text-yellow-600 text-sm border border-yellow-500/20">
                                <WifiOff className="h-4 w-4 shrink-0" />
                                <p>
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
                                "relative flex flex-col items-center justify-center border-2 border-dashed rounded-xl transition-all p-12 text-center",
                                isDragging
                                    ? "border-primary bg-primary/5 scale-[1.01]"
                                    : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50",
                                isBusy
                                    ? "cursor-not-allowed opacity-80 border-primary/20 bg-primary/5"
                                    : "cursor-pointer",
                                error ? "border-red-500 bg-red-50/10" : "",
                            )}
                        >
                            {isRecoveryNeeded ? (
                                <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300">
                                    <div className="p-4 rounded-full bg-yellow-500/10 text-yellow-600">
                                        <AlertCircle className="h-8 w-8" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-lg font-semibold">
                                            Upload Interrupted
                                        </p>
                                        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                                            We found an incomplete upload.
                                            Select the{" "}
                                            <strong>same file</strong> to resume
                                            where you left off.
                                        </p>
                                    </div>
                                    <div className="flex gap-3 mt-2">
                                        <Button
                                            variant="outline"
                                            onClick={() => reset()}
                                        >
                                            Cancel
                                        </Button>
                                        <Button onClick={triggerSelect}>
                                            Select File to Resume
                                        </Button>
                                    </div>
                                </div>
                            ) : status === "preparing" ||
                              status === "hashing" ||
                              status === "uploading" ||
                              status === "paused" ? (
                                <div className="flex flex-col items-center gap-6 w-full max-w-sm animate-in fade-in zoom-in duration-300">
                                    {/* Circular Progress or Loader */}
                                    <div className="relative h-20 w-20 flex items-center justify-center">
                                        <svg
                                            className="absolute inset-0 h-full w-full -rotate-90"
                                            viewBox="0 0 36 36"
                                        >
                                            <path
                                                className="text-muted/20"
                                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="3"
                                            />
                                            <path
                                                className="text-primary transition-all duration-500 ease-out"
                                                strokeDasharray={`${overallProgress}, 100`}
                                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeLinecap="round"
                                                strokeWidth="3"
                                            />
                                        </svg>
                                        <div className="flex flex-col items-center justify-center">
                                            <span className="text-sm font-bold">
                                                {Math.round(overallProgress)}%
                                            </span>
                                        </div>
                                    </div>

                                    <div className="space-y-2 w-full text-center">
                                        <h3 className="font-semibold text-lg">
                                            {status === "hashing"
                                                ? "Preparing Video..."
                                                : status === "paused"
                                                  ? "Upload Paused"
                                                  : "Uploading Video..."}
                                        </h3>
                                        <p className="text-xs text-muted-foreground">
                                            {status === "hashing"
                                                ? "Calculating secure hash for reliability..."
                                                : status === "paused"
                                                  ? "Resume to continue uploading"
                                                  : "Sending parts to server..."}
                                        </p>

                                        {(status === "uploading" ||
                                            isPaused) && (
                                            <div className="flex justify-center gap-4 text-[10px] text-muted-foreground font-medium tabular-nums">
                                                <span>
                                                    {useUploadStore.getState()
                                                        .uploadRate > 0
                                                        ? `${(useUploadStore.getState().uploadRate / 1024 / 1024).toFixed(1)} MB/s`
                                                        : "-- MB/s"}
                                                </span>
                                                <span>•</span>
                                                <span>
                                                    {useUploadStore.getState()
                                                        .timeRemaining > 0
                                                        ? `${Math.ceil(useUploadStore.getState().timeRemaining)}s remaining`
                                                        : "Calculating..."}
                                                </span>
                                            </div>
                                        )}

                                        {/* Linear Progress Bar */}
                                        <div className="h-2 w-full bg-secondary/50 rounded-full overflow-hidden">
                                            <div
                                                className={cn(
                                                    "h-full transition-all duration-300 ease-out",
                                                    isPaused
                                                        ? "bg-yellow-500"
                                                        : "bg-primary",
                                                )}
                                                style={{
                                                    width: `${overallProgress}%`,
                                                }}
                                            />
                                        </div>

                                        <div className="flex justify-center gap-2 pt-2">
                                            {isPaused ? (
                                                <Button
                                                    size="sm"
                                                    onClick={() =>
                                                        useUploadStore
                                                            .getState()
                                                            .resume()
                                                    }
                                                    variant="default"
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
                                                    variant="secondary"
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
                                                className="text-muted-foreground hover:text-destructive"
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-4">
                                    <div className="p-4 rounded-full bg-primary/10 text-primary">
                                        <Upload className="h-8 w-8" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-lg font-semibold">
                                            Select video files to upload
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            Your videos will be private until
                                            you publish them.
                                        </p>
                                    </div>
                                    <Button
                                        variant="secondary"
                                        className="mt-2"
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
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                <p>{error}</p>
                                <div className="ml-auto flex gap-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                            useUploadStore.getState().retry()
                                        }
                                        className="h-auto p-1 text-destructive hover:text-destructive hover:bg-destructive/20 font-semibold"
                                    >
                                        Retry
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => reset()}
                                        className="h-auto p-1 text-destructive hover:text-destructive hover:bg-destructive/20"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}

                        <div className="text-center">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                                Max file size: 2GB • MP4, MOV, AVI supported
                            </p>
                        </div>
                    </div>
                </ModalContent>
            </ModalBody>
        </Modal>
    );
}
