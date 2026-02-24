"use client";

import { cn } from "@/lib/utils";
import {
    CheckCircle2,
    XCircle,
    Loader2,
    Clock,
    Film,
    Clapperboard,
    Tv2,
} from "lucide-react";
import type { ProcessingStatus } from "@/hooks/use-video-status";

// ─── Step definition ──────────────────────────────────────────────────────────
interface Step {
    id: "upload" | "transcode" | "thumbnail" | "ready";
    label: string;
    sublabel: string;
    icon: React.ElementType;
    /** Which status values mean this step is "active" */
    activeOn: ProcessingStatus[];
    /** Which statuses mean this step is "done" */
    doneOn: ProcessingStatus[];
}

const STEPS: Step[] = [
    {
        id: "upload",
        label: "Upload",
        sublabel: "Receiving video file",
        icon: Clapperboard,
        activeOn: ["UPLOADING"],
        doneOn: ["PROCESSING", "READY"],
    },
    {
        id: "transcode",
        label: "Processing",
        sublabel: "Encoding video streams",
        icon: Film,
        activeOn: ["PROCESSING"],
        doneOn: ["READY"],
    },
    {
        id: "thumbnail",
        label: "Finishing up",
        sublabel: "Generating thumbnails",
        icon: Tv2,
        activeOn: [], // no explicit status — shown as sub-step of PROCESSING
        doneOn: ["READY"],
    },
    {
        id: "ready",
        label: "Published",
        sublabel: "Your video is live",
        icon: CheckCircle2,
        activeOn: [],
        doneOn: ["READY"],
    },
];

// ─── Props ───────────────────────────────────────────────────────────────────

interface VideoProcessingPanelProps {
    status: ProcessingStatus | null;
    progress: number;
    error: string | null;
    isLive: boolean;
    className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStepState(
    step: Step,
    status: ProcessingStatus | null,
    failed: boolean,
): "pending" | "active" | "done" | "error" {
    if (failed) {
        if (step.activeOn.includes(status as ProcessingStatus)) return "error";
        if (step.doneOn.includes(status as ProcessingStatus)) return "done";
        return "pending";
    }
    if (step.doneOn.includes(status as ProcessingStatus)) return "done";
    if (step.activeOn.includes(status as ProcessingStatus)) return "active";
    return "pending";
}

function getStatusLabel(status: ProcessingStatus | null): string {
    switch (status) {
        case "UPLOADING":
            return "Uploading video…";
        case "PROCESSING":
            return "Processing your video…";
        case "READY":
            return "Video is ready";
        case "FAILED":
            return "Processing failed";
        default:
            return "Waiting to start…";
    }
}

function getStatusDescription(
    status: ProcessingStatus | null,
    error: string | null,
): string {
    switch (status) {
        case "UPLOADING":
            return "Your video is being received. This won't take long.";
        case "PROCESSING":
            return "We're transcoding your video into multiple resolutions. This can take a few minutes depending on file size.";
        case "READY":
            return "Your video has been processed and is ready to watch. Viewers can access it based on your visibility settings.";
        case "FAILED":
            return (
                error ??
                "Something went wrong during processing. Please try re-uploading."
            );
        default:
            return "Your video is queued for processing.";
    }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function VideoProcessingPanel({
    status,
    progress,
    error,
    isLive,
    className,
}: VideoProcessingPanelProps) {
    const isFailed = status === "FAILED";
    const isReady = status === "READY";
    const clampedProgress = Math.max(0, Math.min(100, progress));

    // When READY, always show 100%
    const displayProgress = isReady ? 100 : clampedProgress;

    // Animate the bar for indeterminate cases (0% but not READY)
    const indeterminate =
        !isReady &&
        displayProgress === 0 &&
        status !== null &&
        status !== "FAILED";

    return (
        <div className={cn("flex flex-col gap-5 text-sm", className)}>
            {/* ── Status label ── */}
            <div className="flex items-center gap-3">
                {isReady ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-tertiary shadow-[0_0_12px_oklch(var(--tertiary)/0.4)]" />
                ) : isFailed ? (
                    <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                ) : (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                )}
                <span
                    className={cn(
                        "font-black text-sm tracking-tight uppercase",
                        isReady && "text-tertiary",
                        isFailed && "text-destructive",
                        !isReady && !isFailed && "text-foreground",
                    )}
                >
                    {getStatusLabel(status)}
                </span>
                {isLive && !isReady && !isFailed && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                        </span>
                        Live
                    </span>
                )}
            </div>

            {!isReady && (
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-2 border border-border/10">
                    {indeterminate ? (
                        <div
                            className="h-full w-1/3 rounded-full bg-primary animate-[slide_1.5s_ease-in-out_infinite]"
                            style={{
                                backgroundImage:
                                    "linear-gradient(90deg, transparent, oklch(var(--primary)), transparent)",
                            }}
                        />
                    ) : (
                        <div
                            className={cn(
                                "h-full rounded-full transition-all duration-700 ease-out",
                                isFailed ? "bg-destructive" : "bg-primary",
                            )}
                            style={{ width: `${displayProgress}%` }}
                        />
                    )}
                </div>
            )}

            {!isReady && !isFailed && displayProgress > 0 && (
                <p className="-mt-3 text-right text-[11px] font-black uppercase tracking-widest text-muted-foreground/40">
                    {displayProgress}%
                </p>
            )}

            {/* ── Step indicators ── */}
            <ol className="flex flex-col gap-2.5">
                {STEPS.map((step: Step) => {
                    const state = getStepState(step, status, isFailed);
                    const Icon = step.icon;

                    return (
                        <li
                            key={step.id}
                            className={cn(
                                "flex items-center gap-4 rounded-2xl px-4 py-3 text-[11px] transition-all duration-300 font-sans group",
                                state === "active" &&
                                    "bg-surface-2 ring-1 ring-primary/20 shadow-sm",
                                state === "done" &&
                                    "opacity-80 bg-surface-1/40",
                                state === "error" &&
                                    "bg-destructive/10 ring-1 ring-destructive/30",
                                state === "pending" && "opacity-30",
                            )}
                        >
                            {/* ── Step icon circle ── */}
                            <div
                                className={cn(
                                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-500",
                                    state === "done" &&
                                        "bg-tertiary/15 text-tertiary shadow-[0_0_10px_oklch(var(--tertiary)/0.2)]",
                                    state === "active" &&
                                        "bg-primary/15 text-primary shadow-[0_0_10px_oklch(var(--primary)/0.2)]",
                                    state === "error" &&
                                        "bg-destructive/15 text-destructive",
                                    state === "pending" &&
                                        "bg-surface-2 text-muted-foreground/40",
                                )}
                            >
                                {state === "done" ? (
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                ) : state === "active" ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : state === "error" ? (
                                    <XCircle className="h-3.5 w-3.5" />
                                ) : (
                                    <Icon className="h-3.5 w-3.5" />
                                )}
                            </div>

                            {/* ── Step text ── */}
                            <div className="flex flex-col gap-0.5">
                                <span
                                    className={cn(
                                        "font-black uppercase tracking-widest text-[10px] leading-tight",
                                        state === "active"
                                            ? "text-primary"
                                            : "text-muted-foreground/60",
                                        state === "done" && "text-tertiary/80",
                                    )}
                                >
                                    {step.label}
                                </span>
                                {state === "active" && (
                                    <span className="text-foreground font-bold tracking-tight text-sm">
                                        {step.sublabel}
                                    </span>
                                )}
                            </div>

                            {/* ── Active step spinner bar ── */}
                            {state === "active" && displayProgress > 0 && (
                                <div className="ml-auto text-xs font-mono text-muted-foreground">
                                    {displayProgress}%
                                </div>
                            )}
                        </li>
                    );
                })}
            </ol>

            {/* ── Description ── */}
            <p
                className={cn(
                    "text-xs leading-relaxed",
                    isFailed ? "text-destructive" : "text-muted-foreground",
                )}
            >
                {getStatusDescription(status, error)}
            </p>

            {/* ── Pending note ── */}
            {status === null && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    Video is queued for processing
                </div>
            )}
        </div>
    );
}
