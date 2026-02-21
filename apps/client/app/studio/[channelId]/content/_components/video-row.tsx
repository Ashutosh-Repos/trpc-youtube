"use client";

import {
    Pencil,
    BarChart2,
    MessageSquare,
    Play,
    ChevronDown,
    Video as VideoIcon,
    MoreVertical,
    Clock,
    Lock,
    Globe,
    EyeOff,
    Link as LinkIcon,
    Trash,
    Download,
    Share2,
    Zap,
    ListVideo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { cn, getMediaUrl } from "@/lib/utils";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import Link from "next/link";
import React from "react";
import { VideoHoverPreview } from "@/components/custom/video-hover-preview";
import { RouterOutputs } from "@/lib/trpc-shared";
import { useUploadStore } from "@/stores/upload-store";

interface VideoRowProps {
    video: RouterOutputs["video"]["getChannelContent"]["items"][number];
    channelId: string;
    isSelected: boolean;
    onSelect: (checked: boolean) => void;
    onSaveToPlaylist?: (videoId: string) => void;
}

export const VideoRow = ({
    video,
    channelId,
    isSelected,
    onSelect,
    onSaveToPlaylist,
}: VideoRowProps) => {
    const router = useRouter();
    const utils = trpc.useUtils();

    // Upload state for row-level resumption
    const {
        videoId: uploadingVideoId,
        status: uploadStatus,
        overallProgress,
    } = useUploadStore();
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const isThisVideoUploading = uploadingVideoId === video.id;

    const updateVisibilityMutation =
        trpc.video.updateVideosVisibility.useMutation({
            onSuccess: () => {
                toast.success("Visibility updated");
                utils.video.getChannelContent.invalidate();
            },
            onError: (error) => {
                toast.error(error.message || "Failed to update visibility");
            },
        });

    const [isScheduleOpen, setIsScheduleOpen] = React.useState(false);
    const [scheduleDate, setScheduleDate] = React.useState<Date | undefined>(
        video.scheduledAt ? new Date(video.scheduledAt) : undefined,
    );
    const [scheduleTime, setScheduleTime] = React.useState<{
        hour: string;
        minute: string;
        ampm: "AM" | "PM";
    }>({
        hour: "12",
        minute: "00",
        ampm: "PM",
    });

    const { mutate: updateVideo, isPending: isScheduling } =
        trpc.video.updateVideo.useMutation({
            onSuccess: () => {
                toast.success("Video scheduled successfully");
                setIsScheduleOpen(false);
                utils.video.getChannelContent.invalidate();
            },
            onError: (err) => {
                toast.error(err.message);
            },
        });

    const handleSchedule = () => {
        if (!scheduleDate) return;

        const scheduledDateTime = new Date(scheduleDate);
        let hours = parseInt(scheduleTime.hour);
        if (scheduleTime.ampm === "PM" && hours !== 12) hours += 12;
        if (scheduleTime.ampm === "AM" && hours === 12) hours = 0;

        scheduledDateTime.setHours(hours);
        scheduledDateTime.setMinutes(parseInt(scheduleTime.minute));

        updateVideo({
            videoId: video.id,
            visibility: "SCHEDULED",
            scheduledAt: scheduledDateTime,
        });
    };

    // Real-time updates for Processing or Scheduled videos
    trpc.video.onProcessingStatus.useSubscription(
        { videoId: video.id },
        {
            enabled:
                video.processingStatus !== "READY" ||
                video.visibility === "SCHEDULED",
            onData: (data) => {
                // If visibility changes (e.g. Scheduled -> Public)
                if (data.visibility && data.visibility !== video.visibility) {
                    toast.success(`Video is now ${data.visibility}`);
                    utils.video.getChannelContent.invalidate();
                }

                // If processing status changes
                if (
                    data.status &&
                    data.status !== video.processingStatus &&
                    data.status !== "PROCESSING" // ignore intermediate progress steps for invalidation to avoid spam
                ) {
                    utils.video.getChannelContent.invalidate();
                }
            },
            onError: (err) => {
                console.error("WS Error:", err);
            },
        },
    );

    const deleteVideoMutation = trpc.video.deleteVideos.useMutation({
        onSuccess: () => {
            toast.success("Video deleted");
            utils.video.getChannelContent.invalidate();
        },
        onError: (error) => {
            toast.error(error.message || "Failed to delete video");
        },
    });

    const isPending =
        updateVisibilityMutation.isPending || deleteVideoMutation.isPending;

    const handleVisibilityChange = (
        newVisibility: "PUBLIC" | "PRIVATE" | "UNLISTED",
    ) => {
        updateVisibilityMutation.mutate({
            channelId,
            videoIds: [video.id],
            visibility: newVisibility,
        });
    };

    const handleCopyLink = () => {
        const url = `${window.location.origin}/watch?v=${video.id}`;
        navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard");
    };

    const handleDelete = () => {
        if (!window.confirm("Are you sure you want to delete this video?"))
            return;

        deleteVideoMutation.mutate({
            channelId,
            videoIds: [video.id],
        });
    };

    return (
        <div
            className={cn(
                "grid grid-cols-12 gap-4 px-6 py-4 transition-colors group relative",
                isSelected
                    ? "bg-primary/5 hover:bg-primary/10"
                    : "hover:bg-white/5",
            )}
        >
            <div className="col-span-5 flex gap-4 min-w-0">
                <div className="flex items-center">
                    <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => onSelect(!!checked)}
                        className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                </div>

                <div className="relative w-32 aspect-video rounded-md overflow-hidden bg-white/5 shrink-0 border border-white/5 shadow-inner group/thumb">
                    <VideoHoverPreview
                        thumbnailUrl={getMediaUrl(video.thumbnailUrl)}
                        spriteUrl={getMediaUrl(video.previewSprite)}
                        duration={video.duration}
                        className="w-full h-full object-cover"
                    />

                    {/* Content Type Badge */}
                    <div className="absolute top-1.5 left-1.5 flex gap-1 z-10">
                        {video.isShort && (
                            <Badge className="bg-[#ff0000] text-white hover:bg-[#ff0000] border-none text-[8px] h-4 px-1 font-black uppercase tracking-tighter shadow-lg ring-1 ring-white/20">
                                <Zap className="w-2 h-2 mr-0.5" /> Short
                            </Badge>
                        )}
                    </div>

                    {/* Processing Overlay */}
                    {video.processingStatus === "FAILED" && (
                        <div className="absolute inset-0 bg-red-500/20 backdrop-blur-[2px] flex items-center justify-center z-10">
                            <Badge
                                variant="destructive"
                                className="scale-75 shadow-lg"
                            >
                                Failed
                            </Badge>
                        </div>
                    )}

                    {video.processingStatus !== "READY" &&
                        video.processingStatus !== "FAILED" && (
                            <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] flex items-center justify-center z-10 w-full h-full">
                                <div className="flex flex-col items-center justify-center gap-1.5 w-full h-full px-2 text-center">
                                    {video.processingStatus === "UPLOADING" ? (
                                        isThisVideoUploading &&
                                        (uploadStatus === "uploading" ||
                                            uploadStatus === "hashing" ||
                                            uploadStatus === "completing") ? (
                                            <>
                                                <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
                                                <span className="text-[8px] font-black uppercase text-primary tracking-widest truncate max-w-full">
                                                    {uploadStatus}{" "}
                                                    {Math.round(
                                                        overallProgress,
                                                    )}
                                                    %
                                                </span>
                                                <div className="w-[80%] h-1 bg-white/10 rounded-full overflow-hidden mt-0.5 shrink-0">
                                                    <div
                                                        className="h-full bg-primary transition-all duration-300"
                                                        style={{
                                                            width: `${overallProgress}%`,
                                                        }}
                                                    />
                                                </div>
                                            </>
                                        ) : isThisVideoUploading &&
                                          uploadStatus === "paused" ? (
                                            <>
                                                <span className="text-[8px] font-black uppercase text-yellow-500 tracking-widest leading-tight truncate max-w-full">
                                                    Paused
                                                </span>
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    className="h-5 text-[9px] px-2 rounded-sm mt-0.5 w-[80%] max-w-full"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        useUploadStore
                                                            .getState()
                                                            .resume();
                                                    }}
                                                >
                                                    Resume
                                                </Button>
                                            </>
                                        ) : (
                                            <>
                                                <span className="text-[8px] font-black uppercase text-primary tracking-widest leading-tight truncate max-w-full">
                                                    Uploading
                                                </span>
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    className="h-5 text-[9px] px-2 rounded-sm mt-0.5 w-[80%] max-w-full"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        fileInputRef.current?.click();
                                                    }}
                                                >
                                                    Resume
                                                </Button>
                                                <input
                                                    ref={fileInputRef}
                                                    type="file"
                                                    accept="video/*"
                                                    className="hidden"
                                                    onChange={(e) => {
                                                        const file =
                                                            e.target.files?.[0];
                                                        if (file) {
                                                            useUploadStore
                                                                .getState()
                                                                .recoverUploadFromRow(
                                                                    video.id,
                                                                    file,
                                                                );
                                                        }
                                                    }}
                                                />
                                            </>
                                        )
                                    ) : (
                                        <>
                                            <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
                                            <div className="flex flex-col items-center gap-0.5 w-full">
                                                <span className="text-[8px] font-black uppercase text-primary tracking-widest shrink-0">
                                                    {video.processingStatus}
                                                </span>
                                                {typeof video.processingProgress ===
                                                    "number" && (
                                                    <div className="w-[80%] h-1 bg-white/10 rounded-full overflow-hidden mt-1 shrink-0">
                                                        <div
                                                            className="h-full bg-primary transition-all duration-300"
                                                            style={{
                                                                width: `${video.processingProgress}%`,
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                </div>

                <div className="flex flex-col justify-center min-w-0 pr-4">
                    <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors cursor-pointer tracking-tight">
                        {video.title}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5 font-medium italic opacity-70">
                        {video.description || "No description provided"}
                    </p>

                    {/* Hover Actions Bar - Premium YouTube Styling */}
                    <div className="flex items-center gap-0.5 mt-2.5 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0 duration-300">
                        <Link
                            href={`/studio/${video.channelId}/content/video/${video.id}`}
                        >
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full hover:bg-white/10 hover:text-primary"
                                title="Details"
                            >
                                <Pencil className="w-4 h-4" />
                            </Button>
                        </Link>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full hover:bg-white/10 hover:text-primary"
                            title="Analytics"
                            onClick={(e) => {
                                e.stopPropagation();
                                router.push(
                                    `/studio/${video.channelId}/analytics?v=${video.id}`,
                                );
                            }}
                        >
                            <BarChart2 className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full hover:bg-white/10 hover:text-primary"
                            title="Comments"
                            onClick={(e) => {
                                e.stopPropagation();
                                router.push(
                                    `/studio/${video.channelId}/content/video/${video.id}#comments`,
                                );
                            }}
                        >
                            <MessageSquare className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full hover:bg-white/10 hover:text-primary"
                            title="Watch"
                            onClick={(e) => {
                                e.stopPropagation();
                                window.open(`/watch?v=${video.id}`, "_blank");
                            }}
                        >
                            <Play className="w-4 h-4 fill-primary" />
                        </Button>
                    </div>
                </div>
            </div>

            <div className="col-span-2 flex items-center">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            className="h-auto p-2 gap-2 hover:bg-white/5 group/trigger"
                        >
                            <div className="flex items-center gap-2">
                                {video.visibility === "PUBLIC" && (
                                    <Globe className="w-4 h-4 text-green-500" />
                                )}
                                {video.visibility === "PRIVATE" && (
                                    <Lock className="w-4 h-4 text-red-500" />
                                )}
                                {video.visibility === "UNLISTED" && (
                                    <EyeOff className="w-4 h-4 text-yellow-500" />
                                )}
                                {video.visibility === "SCHEDULED" && (
                                    <>
                                        <Clock className="w-4 h-4 text-blue-500" />
                                        <div className="flex flex-col">
                                            <span className="text-xs font-semibold capitalize tracking-tight">
                                                {video.visibility.toLowerCase()}
                                            </span>
                                            {video.scheduledAt && (
                                                <span className="text-[10px] text-muted-foreground leading-none">
                                                    {new Date(
                                                        video.scheduledAt,
                                                    ).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                    </>
                                )}
                                {video.visibility !== "SCHEDULED" && (
                                    <span className="text-xs font-semibold capitalize tracking-tight">
                                        {video.visibility.toLowerCase()}
                                    </span>
                                )}
                            </div>
                            <ChevronDown className="w-3 h-3 text-muted-foreground group-hover/trigger:text-white transition-colors" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="start"
                        className="w-40 bg-[#1f1f23] border-white/10 shadow-2xl"
                    >
                        <DropdownMenuItem
                            className="gap-2 focus:bg-white/10"
                            onClick={() => handleVisibilityChange("PUBLIC")}
                        >
                            <Globe className="w-4 h-4 text-green-500" /> Public
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="gap-2 focus:bg-white/10"
                            onClick={() => handleVisibilityChange("UNLISTED")}
                        >
                            <EyeOff className="w-4 h-4 text-yellow-500" />{" "}
                            Unlisted
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="gap-2 focus:bg-white/10"
                            onClick={() => handleVisibilityChange("PRIVATE")}
                        >
                            <Lock className="w-4 h-4 text-red-500" /> Private
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-white/10" />
                        <DropdownMenuItem
                            className="gap-2 focus:bg-white/10"
                            onClick={() => setIsScheduleOpen(true)}
                        >
                            <Clock className="w-4 h-4 text-blue-500" />{" "}
                            Scheduled
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <div className="col-span-2 flex flex-col justify-center text-xs">
                <p className="font-semibold">
                    {new Date(video.createdAt).toLocaleDateString("en-US", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                    })}
                </p>
                <p className="text-muted-foreground mt-0.5 font-medium opacity-60">
                    {video.publishedAt ? "Published" : "Uploaded"}
                </p>
            </div>

            <div className="col-span-1 flex items-center justify-end font-semibold text-sm tabular-nums">
                {video.viewCount.toLocaleString()}
            </div>

            <div className="col-span-2 flex items-center justify-end gap-3 pr-2">
                <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular-nums">
                        {video.commentCount.toLocaleString()}
                    </span>
                    <div className="flex items-center gap-1 opacity-60">
                        <Badge
                            variant="outline"
                            className="text-[10px] py-0 px-1 border-white/10 bg-white/5 font-bold tracking-tighter"
                        >
                            {video.resolutions?.includes("2160p")
                                ? "4K"
                                : video.resolutions?.includes("1080p")
                                  ? "HD"
                                  : "SD"}
                        </Badge>
                    </div>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full hover:bg-white/10"
                        >
                            <MoreVertical className="w-4 h-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="end"
                        className="w-48 bg-[#1f1f23] border-white/10 shadow-2xl"
                    >
                        <DropdownMenuItem
                            className="gap-2 focus:bg-white/10"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleCopyLink();
                            }}
                        >
                            <Share2 className="w-4 h-4" /> Get shareable link
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="gap-2 focus:bg-white/10"
                            onClick={(e) => {
                                e.stopPropagation();
                                window.open(
                                    getMediaUrl(video.thumbnailUrl),
                                    "_blank",
                                );
                            }}
                        >
                            <Download className="w-4 h-4" /> Download
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="gap-2 focus:bg-white/10"
                            onClick={(e) => {
                                e.stopPropagation();
                                onSaveToPlaylist?.(video.id);
                            }}
                        >
                            <ListVideo className="w-4 h-4" /> Save to playlist
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="gap-2 focus:bg-white/10 text-red-500 focus:text-red-400"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDelete();
                            }}
                        >
                            <Trash className="w-4 h-4" /> Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <Dialog open={isScheduleOpen} onOpenChange={setIsScheduleOpen}>
                <DialogContent className="sm:max-w-[425px] bg-neutral-900 border-neutral-800 text-white">
                    <DialogHeader>
                        <DialogTitle>Schedule Video</DialogTitle>
                        <DialogDescription className="text-neutral-400">
                            Select a date and time to make this video public.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-4 py-4">
                        <div className="flex flex-col gap-2">
                            <Label>Publication Date</Label>
                            <Calendar
                                mode="single"
                                selected={scheduleDate}
                                onSelect={setScheduleDate}
                                disabled={(date) => date < new Date()}
                                className="rounded-md border border-neutral-800 bg-neutral-950 mx-auto"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label>Publication Time</Label>
                            <div className="flex gap-2">
                                <Select
                                    value={scheduleTime.hour}
                                    onValueChange={(value) =>
                                        setScheduleTime((prev) => ({
                                            ...prev,
                                            hour: value,
                                        }))
                                    }
                                >
                                    <SelectTrigger className="w-[80px] bg-neutral-950 border-neutral-800">
                                        <SelectValue placeholder="Hour" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-neutral-900 border-neutral-800 text-white">
                                        {Array.from({ length: 12 }, (_, i) =>
                                            (i + 1).toString(),
                                        ).map((hour) => (
                                            <SelectItem key={hour} value={hour}>
                                                {hour}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <span className="flex items-center text-xl text-neutral-500">
                                    :
                                </span>
                                <Select
                                    value={scheduleTime.minute}
                                    onValueChange={(value) =>
                                        setScheduleTime((prev) => ({
                                            ...prev,
                                            minute: value,
                                        }))
                                    }
                                >
                                    <SelectTrigger className="w-[80px] bg-neutral-950 border-neutral-800">
                                        <SelectValue placeholder="Min" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-neutral-900 border-neutral-800 text-white">
                                        {["00", "15", "30", "45"].map(
                                            (minute) => (
                                                <SelectItem
                                                    key={minute}
                                                    value={minute}
                                                >
                                                    {minute}
                                                </SelectItem>
                                            ),
                                        )}
                                    </SelectContent>
                                </Select>
                                <Select
                                    value={scheduleTime.ampm}
                                    onValueChange={(value) =>
                                        setScheduleTime((prev) => ({
                                            ...prev,
                                            ampm: value as "AM" | "PM",
                                        }))
                                    }
                                >
                                    <SelectTrigger className="w-[80px] bg-neutral-950 border-neutral-800">
                                        <SelectValue placeholder="AM/PM" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-neutral-900 border-neutral-800 text-white">
                                        <SelectItem value="AM">AM</SelectItem>
                                        <SelectItem value="PM">PM</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setIsScheduleOpen(false)}
                            className="hover:bg-neutral-800"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSchedule}
                            disabled={!scheduleDate || isScheduling}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {isScheduling ? "Scheduling..." : "Schedule"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
