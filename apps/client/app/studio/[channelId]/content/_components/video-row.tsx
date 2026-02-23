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
        const url = `${window.location.origin}/watch/${video.id}`;
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
                "grid grid-cols-12 gap-4 px-8 py-5 transition-all group relative",
                isSelected
                    ? "bg-primary/5 hover:bg-primary/10"
                    : "hover:bg-surface-1",
            )}
        >
            <div className="col-span-5 flex gap-4 min-w-0">
                <div className="flex items-center">
                    <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => onSelect(!!checked)}
                        className="border-border/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary rounded-md h-5 w-5"
                    />
                </div>

                <div className="relative w-36 aspect-video rounded-xl overflow-hidden bg-surface-1 shrink-0 border border-border/10 shadow-lg group/thumb">
                    <VideoHoverPreview
                        thumbnailUrl={getMediaUrl(video.thumbnailUrl)}
                        spriteUrl={getMediaUrl(video.previewSprite)}
                        duration={video.duration}
                        className="w-full h-full object-cover"
                    />

                    {/* Content Type Badge */}
                    <div className="absolute top-1.5 left-1.5 flex gap-1 z-10">
                        {video.isShort && (
                            <Badge className="bg-destructive text-white hover:bg-destructive border-none text-[8px] h-4 px-1.5 font-black uppercase tracking-widest shadow-lg ring-1 ring-white/10">
                                <Zap className="w-2.5 h-2.5 mr-0.5 fill-current" />{" "}
                                Short
                            </Badge>
                        )}
                    </div>

                    {/* Processing Overlay */}
                    {video.processingStatus === "FAILED" && (
                        <div className="absolute inset-0 bg-red-500/20 backdrop-blur-[2px] flex items-center justify-center z-10">
                            <Badge
                                variant="destructive"
                                className="scale-75 shadow-lg px-2 rounded-lg font-black uppercase tracking-widest text-[9px]"
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
                                                    <div className="w-[80%] h-1 bg-primary/10 rounded-full overflow-hidden mt-1 shrink-0">
                                                        <div
                                                            className="h-full bg-primary transition-all duration-300 shadow-[0_0_8px_oklch(var(--primary))]"
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
                    <p className="font-black text-[15px] truncate group-hover:text-primary transition-colors cursor-pointer tracking-tight text-foreground/90">
                        {video.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground/40 line-clamp-1 mt-1 font-black uppercase tracking-widest">
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
                                className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary transition-all"
                                title="Details"
                            >
                                <Pencil className="w-4 h-4" />
                            </Button>
                        </Link>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full hover:bg-surface-2 hover:text-primary group/action transition-all"
                            title="Analytics"
                            onClick={(e) => {
                                e.stopPropagation();
                                router.push(
                                    `/studio/${video.channelId}/analytics?v=${video.id}`,
                                );
                            }}
                        >
                            <BarChart2 className="w-4 h-4 transition-transform group-hover/action:scale-110" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full hover:bg-surface-2 hover:text-primary group/action transition-all"
                            title="Comments"
                            onClick={(e) => {
                                e.stopPropagation();
                                router.push(
                                    `/studio/${video.channelId}/content/video/${video.id}#comments`,
                                );
                            }}
                        >
                            <MessageSquare className="w-4 h-4 transition-transform group-hover/action:scale-110" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full hover:bg-surface-2 hover:text-primary group/action transition-all"
                            title="Watch"
                            onClick={(e) => {
                                e.stopPropagation();
                                window.open(`/watch/${video.id}`, "_blank");
                            }}
                        >
                            <Play className="w-4 h-4 fill-primary text-primary transition-transform group-hover/action:scale-110" />
                        </Button>
                    </div>
                </div>
            </div>

            <div className="col-span-2 flex items-center">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            className="h-auto px-3 py-2 gap-2.5 rounded-xl hover:bg-surface-2 group/trigger transition-all border border-transparent hover:border-border/10"
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
                                    <span className="text-[11px] font-black uppercase tracking-widest text-foreground/80">
                                        {video.visibility.toLowerCase()}
                                    </span>
                                )}
                            </div>
                            <ChevronDown className="w-3 h-3 text-muted-foreground group-hover/trigger:text-white transition-colors" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="start"
                        className="w-40 bg-surface-3 border-border/10 text-foreground rounded-xl shadow-2xl p-1.5"
                    >
                        <DropdownMenuItem
                            className="gap-2 focus:bg-primary/10 focus:text-primary rounded-lg transition-colors cursor-pointer"
                            onClick={() => handleVisibilityChange("PUBLIC")}
                        >
                            <Globe className="w-4 h-4 text-emerald-500" />{" "}
                            Public
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="gap-2 focus:bg-primary/10 focus:text-primary rounded-lg transition-colors cursor-pointer"
                            onClick={() => handleVisibilityChange("UNLISTED")}
                        >
                            <EyeOff className="w-4 h-4 text-amber-500" />{" "}
                            Unlisted
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="gap-2 focus:bg-primary/10 focus:text-primary rounded-lg transition-colors cursor-pointer"
                            onClick={() => handleVisibilityChange("PRIVATE")}
                        >
                            <Lock className="w-4 h-4 text-destructive" />{" "}
                            Private
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-border/10" />
                        <DropdownMenuItem
                            className="gap-2 focus:bg-primary/10 focus:text-primary rounded-lg transition-colors cursor-pointer"
                            onClick={() => setIsScheduleOpen(true)}
                        >
                            <Clock className="w-4 h-4 text-primary" /> Scheduled
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
                            className="text-[10px] py-0 px-1.5 border-border/10 bg-surface-2 font-black tracking-widest text-muted-foreground/60 rounded-md"
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
                            className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary transition-all"
                        >
                            <MoreVertical className="w-4 h-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="end"
                        className="w-48 bg-surface-3 border-border/10 text-foreground shadow-2xl rounded-xl p-1.5"
                    >
                        <DropdownMenuItem
                            className="gap-2 focus:bg-primary/10 focus:text-primary rounded-lg transition-colors cursor-pointer"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleCopyLink();
                            }}
                        >
                            <Share2 className="w-4 h-4" /> Get shareable link
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="gap-2 focus:bg-primary/10 focus:text-primary rounded-lg transition-colors cursor-pointer"
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
                            className="gap-2 focus:bg-primary/10 focus:text-primary rounded-lg transition-colors cursor-pointer"
                            onClick={(e) => {
                                e.stopPropagation();
                                onSaveToPlaylist?.(video.id);
                            }}
                        >
                            <ListVideo className="w-4 h-4" /> Save to playlist
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-border/10" />
                        <DropdownMenuItem
                            className="gap-2 focus:bg-destructive/10 focus:text-destructive rounded-lg transition-colors cursor-pointer"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDelete();
                            }}
                        >
                            <Trash className="w-4 h-4 text-destructive/60" />{" "}
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <Dialog open={isScheduleOpen} onOpenChange={setIsScheduleOpen}>
                <DialogContent className="sm:max-w-[425px] bg-surface-3 border-border/10 text-foreground shadow-2xl rounded-3xl p-8">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black tracking-tighter uppercase">
                            Schedule Video
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground/40 text-[11px] font-black uppercase tracking-widest">
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
                                className="rounded-2xl border border-border/10 bg-surface-1 mx-auto shadow-inner"
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
                                    <SelectTrigger className="w-[85px] bg-surface-1 border-border/10 h-10 rounded-xl text-xs font-black tracking-widest uppercase">
                                        <SelectValue placeholder="Hour" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-surface-3 border-border/10 text-foreground rounded-2xl shadow-2xl p-1.5">
                                        {Array.from({ length: 12 }, (_, i) =>
                                            (i + 1).toString(),
                                        ).map((hour: string) => (
                                            <SelectItem
                                                key={hour}
                                                value={hour}
                                                className="focus:bg-primary/10 focus:text-primary rounded-lg transition-colors cursor-pointer"
                                            >
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
                                    <SelectTrigger className="w-[85px] bg-surface-1 border-border/10 h-10 rounded-xl text-xs font-black tracking-widest uppercase">
                                        <SelectValue placeholder="Min" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-surface-3 border-border/10 text-foreground rounded-2xl shadow-2xl p-1.5">
                                        {["00", "15", "30", "45"].map(
                                            (minute) => (
                                                <SelectItem
                                                    key={minute}
                                                    value={minute}
                                                    className="focus:bg-primary/10 focus:text-primary rounded-lg transition-colors cursor-pointer"
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
                                    <SelectTrigger className="w-[85px] bg-surface-1 border-border/10 h-10 rounded-xl text-xs font-black tracking-widest uppercase">
                                        <SelectValue placeholder="AM/PM" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-surface-3 border-border/10 text-foreground rounded-2xl shadow-2xl p-1.5">
                                        <SelectItem
                                            value="AM"
                                            className="focus:bg-primary/10 focus:text-primary rounded-lg transition-colors cursor-pointer"
                                        >
                                            AM
                                        </SelectItem>
                                        <SelectItem
                                            value="PM"
                                            className="focus:bg-primary/10 focus:text-primary rounded-lg transition-colors cursor-pointer"
                                        >
                                            PM
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setIsScheduleOpen(false)}
                            className="hover:bg-surface-2 font-black uppercase tracking-widest text-[11px] rounded-xl h-12 px-6"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSchedule}
                            disabled={!scheduleDate || isScheduling}
                            className="bg-primary hover:bg-primary/90 text-black font-black uppercase tracking-widest text-[11px] rounded-xl h-12 px-10 shadow-lg shadow-primary/20"
                        >
                            {isScheduling ? "Scheduling..." : "Schedule"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
