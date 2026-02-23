"use client";

import { useState, KeyboardEvent, useRef, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import {
    Loader2,
    Save,
    Undo,
    Eye,
    Calendar,
    Image as ImageIcon,
    AlertCircle,
    X,
    CheckCircle2,
    AlertTriangle,
} from "lucide-react";

import { cn, getMediaUrl, AllowedMimeTypes, MaxSizes } from "@/lib/utils";
import { getPresignedUrl } from "@/lib/storage";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { RouterOutputs } from "@/lib/trpc-shared";
import { VideoPlayer } from "@/components/custom/video-player";
import { useVideoStatus } from "@/hooks/use-video-status";
import { VideoProcessingPanel } from "@/components/custom/video-processing-panel";

type VideoData = RouterOutputs["video"]["getVideo"];

const updateVideoSchema = z
    .object({
        title: z.string().min(1, "Title is required").max(100),
        description: z.string().max(5000).optional(),
        visibility: z.enum(["PUBLIC", "PRIVATE", "UNLISTED", "SCHEDULED"]),
        scheduledAt: z.date().nullable().optional(),
        categoryId: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
        thumbnailUrl: z.string().optional(),
        isAgeRestricted: z.boolean().optional(),
        allowComments: z.boolean().optional(),
        allowEmbedding: z.boolean().optional(),
    })
    .refine(
        (data) => {
            if (data.visibility === "SCHEDULED") {
                return data.scheduledAt != null;
            }
            return true;
        },
        {
            message: "Schedule date is required when visibility is scheduled",
            path: ["scheduledAt"],
        },
    );

interface VideoEditorProps {
    video: VideoData;
    channelId: string;
}

export function VideoEditor({ video, channelId }: VideoEditorProps) {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const [tagInput, setTagInput] = useState("");
    const [isUploadingThumbnail, setIsUploadingThumbnail] = useState(false);
    const thumbnailInputRef = useRef<HTMLInputElement>(null);

    const utils = trpc.useUtils();
    // Use useQuery with initialData for instant load + reactive updates
    const { data: videoData } = trpc.video.getVideo.useQuery(
        { videoId: video.id },
        {
            initialData: video,
            refetchOnMount: false,
            refetchOnWindowFocus: false,
        },
    );

    // ── Live processing status ───────────────────────────────────────────────
    const {
        status: processingStatus,
        progress,
        hlsUrl: liveHlsUrl,
        thumbnails: liveThumbnails,
        previewSpriteVtt: livePreviewSpriteVtt,
        error: processingError,
        isLive,
        isTerminal,
    } = useVideoStatus(video.id, {
        initialStatus: (video.processingStatus as any) ?? undefined,
        initialHlsUrl: video.hlsPlaylistUrl ?? null,
        initialThumbnails: video.thumbnailOptions ?? [],
        onReady: () => {
            // Refresh DB data once processing completes
            utils.video.getVideo.invalidate({ videoId: video.id });
            router.refresh();
        },
    });

    // Merge: live data wins over DB snapshot when available
    const displayHls = liveHlsUrl || videoData.hlsPlaylistUrl;
    const displaySprite = livePreviewSpriteVtt || videoData.previewSprite;
    const displayThumbnail = videoData.thumbnailUrl;
    const videoIsViewable = !!displayHls && !!displayThumbnail;

    const form = useForm<z.infer<typeof updateVideoSchema>>({
        resolver: zodResolver(updateVideoSchema),
        defaultValues: {
            title: videoData.title,
            description: videoData.description || "",
            visibility: videoData.visibility,
            scheduledAt: videoData.scheduledAt
                ? new Date(videoData.scheduledAt)
                : null,
            categoryId: videoData.categoryId,
            tags: (videoData.tags
                ? videoData.tags.map((t: any) => t.name)
                : []) as string[],
            thumbnailUrl: videoData.thumbnailUrl || "",
            isAgeRestricted: videoData.isAgeRestricted,
            allowComments: videoData.allowComments,
            allowEmbedding: videoData.allowEmbedding,
        },
    });

    const {
        formState: { isDirty },
    } = form;

    const updateVideo = trpc.video.updateVideo.useMutation({
        onSuccess: (data) => {
            toast.success("Changes saved", {
                description: "Your video metadata has been updated.",
            });
            // Invalidate query to update local state immediately
            utils.video.getVideo.invalidate({ videoId: video.id });
            utils.video.getChannelContent.invalidate();
            // Refresh router to update server components
            router.refresh();
            setIsSaving(false);

            // Re-sync form with new data
            form.reset({
                title: data.title,
                description: data.description || "",
                visibility: data.visibility as any,
                scheduledAt: data.scheduledAt
                    ? new Date(data.scheduledAt)
                    : null,
                categoryId: data.categoryId,
                tags: data.tags ? data.tags.map((t: any) => t.name) : [],
                thumbnailUrl: data.thumbnailUrl || "",
                isAgeRestricted: data.isAgeRestricted,
                allowComments: data.allowComments,
                allowEmbedding: data.allowEmbedding,
            });
        },
        onError: (err) => {
            toast.error("Error saving changes", {
                description: err.message,
            });
            setIsSaving(false);
        },
    });
    const handleThumbnailUploadClick = () => {
        thumbnailInputRef.current?.click();
    };

    const handleThumbnailChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validation
        if (!AllowedMimeTypes.thumbnail.includes(file.type)) {
            toast.error("Invalid file type", {
                description: "Please upload a JPEG, PNG or WebP image.",
            });
            return;
        }

        if (file.size > MaxSizes.thumbnail) {
            toast.error("File too large", {
                description: "Thumbnail size must be less than 5MB.",
            });
            return;
        }

        setIsUploadingThumbnail(true);
        try {
            const result = await getPresignedUrl(
                "thumbnail",
                file.type,
                file.size,
            );
            if (!result.success || !result.data) {
                throw new Error(result.error || "Failed to get upload URL");
            }
            const { url, key } = result.data;

            // Upload to S3/MinIO
            const res = await fetch(url, {
                method: "PUT",
                body: file,
                headers: {
                    "Content-Type": file.type,
                },
            });

            if (!res.ok) throw new Error("Upload failed");

            form.setValue("thumbnailUrl", key, { shouldDirty: true });
            toast.success("Thumbnail uploaded successfully");
        } catch (error) {
            console.error("Thumbnail upload failed:", error);
            toast.error("Upload failed", {
                description: "Could not upload custom thumbnail.",
            });
        } finally {
            setIsUploadingThumbnail(false);
            if (e.target) e.target.value = ""; // Reset input
        }
    };

    // Fetch categories for dropdown
    const { data: categoriesData } = trpc.category.getCategories.useQuery();

    const onSubmit = (values: z.infer<typeof updateVideoSchema>) => {
        setIsSaving(true);
        updateVideo.mutate({
            ...values,
            categoryId:
                values.categoryId && values.categoryId !== "null"
                    ? values.categoryId
                    : null,
            tags: values.tags || [],
            videoId: video.id,
        });
    };

    const handleUndo = () => {
        form.reset();
    };

    const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            const newTag = tagInput.trim();
            if (newTag) {
                const currentTags = form.getValues("tags") || [];
                const isDuplicate = currentTags.some(
                    (t) => t.toLowerCase() === newTag.toLowerCase(),
                );

                if (!isDuplicate) {
                    form.setValue("tags", [...currentTags, newTag], {
                        shouldDirty: true,
                    });
                }
                setTagInput("");
            }
        }
    };

    const removeTag = (tagToRemove: string) => {
        const currentTags = form.getValues("tags") || [];
        form.setValue(
            "tags",
            currentTags.filter((tag) => tag !== tagToRemove),
            { shouldDirty: true },
        );
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                {/* Sticky Header */}
                <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border/10 bg-background/80 px-8 py-5 backdrop-blur-xl">
                    <div>
                        <h1 className="text-2xl font-black tracking-tighter uppercase text-foreground/90">
                            Video details
                        </h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleUndo}
                            disabled={!isDirty || isSaving}
                            className="rounded-xl font-black uppercase text-[11px] tracking-widest hover:bg-surface-2"
                        >
                            <Undo className="mr-2 h-4 w-4" />
                            Undo Changes
                        </Button>
                        <Button
                            type="submit"
                            size="sm"
                            disabled={!isDirty || isSaving}
                            className="rounded-xl font-black uppercase text-[11px] tracking-widest bg-primary text-black hover:bg-primary/90 shadow-[0_0_20px_-5px_oklch(var(--primary)/0.4)]"
                        >
                            {isSaving ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="mr-2 h-4 w-4" />
                            )}
                            Save
                        </Button>
                    </div>
                </div>

                <div className="px-6 pb-20">
                    <div className="grid gap-6 lg:grid-cols-3">
                        {/* LEFT COLUMN: Main Metadata */}
                        <div className="space-y-6 lg:col-span-2">
                            <Card className="bg-surface-1 border-border/10 rounded-2xl overflow-hidden shadow-xl">
                                <CardHeader className="px-8 pt-8 pb-4">
                                    <CardTitle className="text-sm font-black uppercase tracking-widest text-foreground/40">
                                        Details
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="title"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-[11px] font-black uppercase tracking-widest text-foreground/60">
                                                    Title (required)
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="Add a title that describes your video"
                                                        className="bg-surface-2 border-border/10 focus-visible:ring-primary/20 focus-visible:border-primary/30 h-12 rounded-xl transition-all font-medium"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="description"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-[11px] font-black uppercase tracking-widest text-foreground/60">
                                                    Description
                                                </FormLabel>
                                                <FormControl>
                                                    <Textarea
                                                        placeholder="Tell viewers about your video"
                                                        className="min-h-[200px] resize-none bg-surface-2 border-border/10 focus-visible:ring-primary/20 focus-visible:border-primary/30 rounded-xl transition-all font-medium p-4"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </CardContent>
                            </Card>

                            <Card className="bg-surface-1 border-border/10 rounded-2xl overflow-hidden shadow-xl">
                                <CardHeader className="px-8 pt-8 pb-4">
                                    <CardTitle className="text-sm font-black uppercase tracking-widest text-foreground/40">
                                        Thumbnail
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <FormField
                                        control={form.control}
                                        name="thumbnailUrl"
                                        render={({ field }) => (
                                            <FormItem>
                                                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                                                    {video.thumbnailOptions &&
                                                        video.thumbnailOptions.map(
                                                            (url, idx) => (
                                                                <div
                                                                    key={idx}
                                                                    className={cn(
                                                                        "relative aspect-video cursor-pointer overflow-hidden rounded-lg border-2 transition-all",
                                                                        field.value ===
                                                                            url
                                                                            ? "border-primary ring-2 ring-primary/20"
                                                                            : "border-transparent hover:border-muted-foreground/25",
                                                                    )}
                                                                    onClick={() =>
                                                                        field.onChange(
                                                                            url,
                                                                        )
                                                                    }
                                                                >
                                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                    <img
                                                                        src={getMediaUrl(
                                                                            url,
                                                                        )}
                                                                        alt={`Thumbnail option ${idx + 1}`}
                                                                        className="h-full w-full object-cover"
                                                                    />
                                                                </div>
                                                            ),
                                                        )}
                                                    {/* Custom Upload Placeholder */}
                                                    <div
                                                        className={cn(
                                                            "flex aspect-video cursor-pointer items-center justify-center rounded-xl border-2 border-dashed transition-all",
                                                            isUploadingThumbnail
                                                                ? "border-muted-foreground/10 bg-surface-2 cursor-wait"
                                                                : "border-border/20 hover:border-primary/50 hover:bg-primary/5",
                                                            field.value &&
                                                                !video.thumbnailOptions?.includes(
                                                                    field.value,
                                                                )
                                                                ? "border-primary ring-4 ring-primary/10"
                                                                : "",
                                                        )}
                                                        onClick={
                                                            !isUploadingThumbnail
                                                                ? handleThumbnailUploadClick
                                                                : undefined
                                                        }
                                                    >
                                                        {isUploadingThumbnail ? (
                                                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                                        ) : field.value &&
                                                          !video.thumbnailOptions?.includes(
                                                              field.value,
                                                          ) ? (
                                                            <div className="relative h-full w-full overflow-hidden rounded-lg group/custom-thumb">
                                                                <img
                                                                    src={getMediaUrl(
                                                                        field.value,
                                                                    )}
                                                                    alt="Custom thumbnail"
                                                                    className="h-full w-full object-cover"
                                                                />
                                                                <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm opacity-0 group-hover/custom-thumb:opacity-100 transition-all">
                                                                    <ImageIcon className="h-6 w-6 text-foreground" />
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col items-center gap-2 text-center text-xs text-muted-foreground/40 group-hover:text-primary transition-colors">
                                                                <ImageIcon className="h-5 w-5" />
                                                                <p className="font-black uppercase tracking-widest text-[10px]">
                                                                    Upload file
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <input
                                                        ref={thumbnailInputRef}
                                                        type="file"
                                                        accept="image/jpeg,image/png,image/webp"
                                                        className="hidden"
                                                        onChange={
                                                            handleThumbnailChange
                                                        }
                                                    />
                                                </div>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </CardContent>
                            </Card>

                            <Card className="bg-surface-1 border-border/10 rounded-2xl overflow-hidden shadow-xl">
                                <CardHeader className="px-8 pt-8 pb-4">
                                    <CardTitle className="text-sm font-black uppercase tracking-widest text-foreground/40">
                                        Category, Tags, and More
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <FormField
                                        control={form.control}
                                        name="categoryId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-[11px] font-black uppercase tracking-widest text-foreground/60">
                                                    Category
                                                </FormLabel>
                                                <Select
                                                    onValueChange={
                                                        field.onChange
                                                    }
                                                    defaultValue={
                                                        field.value || undefined
                                                    }
                                                >
                                                    <FormControl>
                                                        <SelectTrigger className="bg-surface-2 border-border/10 focus:ring-primary/20 focus:border-primary/30 h-11 rounded-xl transition-all">
                                                            <SelectValue placeholder="Select a category" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent className="bg-surface-3 border-border/10 rounded-xl shadow-2xl p-1">
                                                        <SelectItem
                                                            value="null"
                                                            className="rounded-lg focus:bg-primary/10 focus:text-primary transition-colors"
                                                        >
                                                            None
                                                        </SelectItem>
                                                        {categoriesData?.categories.map(
                                                            (
                                                                category: RouterOutputs["category"]["getCategories"]["categories"][number],
                                                            ) => (
                                                                <SelectItem
                                                                    key={
                                                                        category.id
                                                                    }
                                                                    value={
                                                                        category.id
                                                                    }
                                                                    className="rounded-lg focus:bg-primary/10 focus:text-primary transition-colors"
                                                                >
                                                                    {
                                                                        category.name
                                                                    }
                                                                </SelectItem>
                                                            ),
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="tags"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-[11px] font-black uppercase tracking-widest text-foreground/60">
                                                    Tags
                                                </FormLabel>
                                                <FormControl>
                                                    <div className="space-y-3">
                                                        <Input
                                                            placeholder="Enter comma-separated tags"
                                                            value={tagInput}
                                                            onChange={(e) =>
                                                                setTagInput(
                                                                    e.target
                                                                        .value,
                                                                )
                                                            }
                                                            onKeyDown={
                                                                handleTagKeyDown
                                                            }
                                                            className="bg-surface-2 border-border/10 focus-visible:ring-primary/20 focus-visible:border-primary/30 h-11 rounded-xl transition-all"
                                                        />
                                                        <div className="flex flex-wrap gap-2">
                                                            {field.value?.map(
                                                                (
                                                                    tag,
                                                                    index,
                                                                ) => (
                                                                    <Badge
                                                                        key={
                                                                            index
                                                                        }
                                                                        variant="secondary"
                                                                        className="flex items-center gap-1.5 bg-primary/10 text-primary hover:bg-primary/20 border-transparent transition-all rounded-lg px-2.5 py-1 font-bold text-[10px] uppercase tracking-wider"
                                                                    >
                                                                        {tag}
                                                                        <X
                                                                            className="h-3 w-3 cursor-pointer opacity-60 hover:opacity-100"
                                                                            onClick={() =>
                                                                                removeTag(
                                                                                    tag,
                                                                                )
                                                                            }
                                                                        />
                                                                    </Badge>
                                                                ),
                                                            )}
                                                        </div>
                                                    </div>
                                                </FormControl>
                                                <FormDescription>
                                                    Press Enter or comma to add
                                                    a tag
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </CardContent>
                            </Card>
                        </div>

                        {/* RIGHT COLUMN: Visibility & Schedule */}
                        <div className="space-y-6">
                            {/* ── Video preview / processing panel ── */}
                            <Card className="bg-surface-1 border-border/10 rounded-2xl overflow-hidden shadow-xl border-none">
                                <CardContent className="p-0">
                                    {videoIsViewable ? (
                                        /* ── Player (video ready) ── */
                                        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
                                            <VideoPlayer
                                                videoId={video.id}
                                                src={getMediaUrl(displayHls!)}
                                                poster={getMediaUrl(
                                                    displayThumbnail!,
                                                )}
                                                spriteVtt={
                                                    displaySprite
                                                        ? getMediaUrl(
                                                              displaySprite,
                                                          )
                                                        : undefined
                                                }
                                            />
                                        </div>
                                    ) : (
                                        /* ── Processing panel ── */
                                        <div className="aspect-video w-full overflow-hidden rounded-none bg-surface-2 p-12 flex flex-col justify-center items-center text-center border-b border-border/10">
                                            <VideoProcessingPanel
                                                status={processingStatus}
                                                progress={progress}
                                                error={processingError}
                                                isLive={isLive}
                                            />
                                        </div>
                                    )}

                                    {/* ── Status badge row ── */}
                                    <div className="mt-0 py-4 px-8 flex items-center gap-3 bg-surface-1">
                                        {processingStatus === "READY" ? (
                                            <span className="flex items-center gap-2 text-[10px] text-emerald-500 font-black uppercase tracking-widest">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                Processing complete
                                            </span>
                                        ) : processingStatus === "FAILED" ? (
                                            <span className="flex items-center gap-2 text-[10px] text-destructive font-black uppercase tracking-widest">
                                                <AlertTriangle className="h-3.5 w-3.5" />
                                                Processing failed
                                            </span>
                                        ) : processingStatus ? (
                                            <span className="flex items-center gap-2 text-[10px] text-muted-foreground/60 font-black uppercase tracking-widest">
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                {processingStatus ===
                                                "UPLOADING"
                                                    ? "Uploading…"
                                                    : "Processing video…"}
                                            </span>
                                        ) : null}
                                    </div>

                                    {/* ── Video link ── */}
                                    <div className="mt-0 break-all bg-surface-2/50 p-6 text-[11px] border-t border-border/10">
                                        <p className="font-black uppercase tracking-widest text-foreground/30 mb-2">
                                            Video Link
                                        </p>
                                        <a
                                            href={`/watch/${video.id}`}
                                            target="_blank"
                                            className="text-primary hover:underline font-bold text-sm"
                                        >
                                            {typeof window !== "undefined"
                                                ? `${window.location.host}/watch/${video.id}`
                                                : `/watch/${video.id}`}
                                        </a>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="bg-surface-1 border-border/10 rounded-2xl overflow-hidden shadow-xl">
                                <CardHeader className="px-8 pt-8 pb-4">
                                    <CardTitle className="text-sm font-black uppercase tracking-widest text-foreground/40">
                                        Visibility
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="visibility"
                                        render={({ field }) => (
                                            <FormItem className="space-y-3">
                                                <FormControl>
                                                    <div className="grid gap-2">
                                                        {[
                                                            {
                                                                value: "PRIVATE",
                                                                label: "Private",
                                                                desc: "Only you can watch your video",
                                                            },
                                                            {
                                                                value: "UNLISTED",
                                                                label: "Unlisted",
                                                                desc: "Anyone with the video link can watch your video",
                                                            },
                                                            {
                                                                value: "PUBLIC",
                                                                label: "Public",
                                                                desc: "Everyone can watch your video",
                                                            },
                                                            {
                                                                value: "SCHEDULED",
                                                                label: "Scheduled",
                                                                desc: "Select a date to make your video public",
                                                            },
                                                        ].map((option) => (
                                                            <div
                                                                key={
                                                                    option.value
                                                                }
                                                                className="flex items-start space-x-3 space-y-0 text-sm p-3 rounded-xl hover:bg-surface-2 transition-all cursor-pointer group"
                                                                onClick={(
                                                                    e,
                                                                ) => {
                                                                    // Only trigger if we didn't click the checkbox itself (already handled by checkbox)
                                                                    // but actually Checkbox component usually handles this via label peer logic
                                                                }}
                                                            >
                                                                <Checkbox
                                                                    checked={
                                                                        field.value ===
                                                                        option.value
                                                                    }
                                                                    onCheckedChange={(
                                                                        checked,
                                                                    ) => {
                                                                        if (
                                                                            checked
                                                                        ) {
                                                                            field.onChange(
                                                                                option.value,
                                                                            );
                                                                        }
                                                                        if (
                                                                            option.value !==
                                                                            "SCHEDULED"
                                                                        ) {
                                                                            form.setValue(
                                                                                "scheduledAt",
                                                                                null,
                                                                                {
                                                                                    shouldDirty: true,
                                                                                },
                                                                            );
                                                                        }
                                                                    }}
                                                                    className="mt-0.5 border-border/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                                                />
                                                                <div className="grid gap-1 leading-none">
                                                                    <label className="text-[13px] font-black uppercase tracking-widest text-foreground/80 group-hover:text-primary transition-colors cursor-pointer">
                                                                        {
                                                                            option.label
                                                                        }
                                                                    </label>
                                                                    <p className="text-[11px] text-muted-foreground/40 font-medium">
                                                                        {
                                                                            option.desc
                                                                        }
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </FormControl>
                                                <FormMessage />
                                                {field.value ===
                                                    "SCHEDULED" && (
                                                    <div className="pt-4 animate-in fade-in slide-in-from-top-2">
                                                        <FormField
                                                            control={
                                                                form.control
                                                            }
                                                            name="scheduledAt"
                                                            render={({
                                                                field: dateField,
                                                            }) => (
                                                                <FormItem className="flex flex-col gap-2 pt-4">
                                                                    <FormLabel className="text-[11px] font-black uppercase tracking-widest text-foreground/60">
                                                                        Schedule
                                                                        Date
                                                                    </FormLabel>
                                                                    <Popover>
                                                                        <PopoverTrigger
                                                                            asChild
                                                                        >
                                                                            <FormControl>
                                                                                <Button
                                                                                    variant={
                                                                                        "outline"
                                                                                    }
                                                                                    className={cn(
                                                                                        "w-full bg-surface-2 border-border/10 h-12 rounded-xl text-left font-black uppercase text-[11px] tracking-widest px-4 hover:bg-surface-3 transition-all",
                                                                                        !dateField.value &&
                                                                                            "text-muted-foreground/40",
                                                                                    )}
                                                                                >
                                                                                    {dateField.value ? (
                                                                                        format(
                                                                                            dateField.value,
                                                                                            "PPP",
                                                                                        )
                                                                                    ) : (
                                                                                        <span>
                                                                                            Pick
                                                                                            a
                                                                                            date
                                                                                        </span>
                                                                                    )}
                                                                                    <Calendar className="ml-auto h-4 w-4 opacity-30" />
                                                                                </Button>
                                                                            </FormControl>
                                                                        </PopoverTrigger>
                                                                        <PopoverContent
                                                                            className="w-auto p-0"
                                                                            align="start"
                                                                        >
                                                                            <CalendarComponent
                                                                                mode="single"
                                                                                selected={
                                                                                    dateField.value ||
                                                                                    undefined
                                                                                }
                                                                                onSelect={(
                                                                                    date,
                                                                                ) => {
                                                                                    if (
                                                                                        !date
                                                                                    )
                                                                                        return;
                                                                                    // Preserve time from existing value
                                                                                    if (
                                                                                        dateField.value
                                                                                    ) {
                                                                                        date.setHours(
                                                                                            dateField.value.getHours(),
                                                                                        );
                                                                                        date.setMinutes(
                                                                                            dateField.value.getMinutes(),
                                                                                        );
                                                                                    } else {
                                                                                        // Default 12:00 PM
                                                                                        date.setHours(
                                                                                            12,
                                                                                            0,
                                                                                            0,
                                                                                            0,
                                                                                        );
                                                                                    }
                                                                                    dateField.onChange(
                                                                                        date,
                                                                                    );
                                                                                }}
                                                                                disabled={(
                                                                                    date,
                                                                                ) =>
                                                                                    date <
                                                                                    new Date()
                                                                                }
                                                                                initialFocus
                                                                            />
                                                                            <div className="p-3 border-t border-border">
                                                                                <div className="flex flex-col gap-2">
                                                                                    <Label className="text-xs">
                                                                                        Time
                                                                                    </Label>
                                                                                    <div className="flex gap-2">
                                                                                        <Select
                                                                                            value={(
                                                                                                (dateField.value?.getHours() ??
                                                                                                    12) %
                                                                                                    12 ||
                                                                                                12
                                                                                            ).toString()}
                                                                                            onValueChange={(
                                                                                                val,
                                                                                            ) => {
                                                                                                const newDate =
                                                                                                    dateField.value
                                                                                                        ? new Date(
                                                                                                              dateField.value,
                                                                                                          )
                                                                                                        : new Date();
                                                                                                let hours =
                                                                                                    parseInt(
                                                                                                        val,
                                                                                                    );
                                                                                                const currentHours =
                                                                                                    newDate.getHours();
                                                                                                const isPM =
                                                                                                    currentHours >=
                                                                                                    12;
                                                                                                if (
                                                                                                    isPM &&
                                                                                                    hours !==
                                                                                                        12
                                                                                                )
                                                                                                    hours += 12;
                                                                                                if (
                                                                                                    !isPM &&
                                                                                                    hours ===
                                                                                                        12
                                                                                                )
                                                                                                    hours = 0;
                                                                                                newDate.setHours(
                                                                                                    hours,
                                                                                                );
                                                                                                dateField.onChange(
                                                                                                    newDate,
                                                                                                );
                                                                                            }}
                                                                                        >
                                                                                            <SelectTrigger className="w-[65px] h-8 text-xs">
                                                                                                <SelectValue placeholder="Hour" />
                                                                                            </SelectTrigger>
                                                                                            <SelectContent>
                                                                                                {Array.from(
                                                                                                    {
                                                                                                        length: 12,
                                                                                                    },
                                                                                                    (
                                                                                                        _,
                                                                                                        i,
                                                                                                    ) =>
                                                                                                        i +
                                                                                                        1,
                                                                                                ).map(
                                                                                                    (
                                                                                                        h,
                                                                                                    ) => (
                                                                                                        <SelectItem
                                                                                                            key={
                                                                                                                h
                                                                                                            }
                                                                                                            value={h.toString()}
                                                                                                        >
                                                                                                            {
                                                                                                                h
                                                                                                            }
                                                                                                        </SelectItem>
                                                                                                    ),
                                                                                                )}
                                                                                            </SelectContent>
                                                                                        </Select>
                                                                                        <span className="flex items-center text-sm text-muted-foreground">
                                                                                            :
                                                                                        </span>
                                                                                        <Select
                                                                                            value={(
                                                                                                dateField.value?.getMinutes() ??
                                                                                                0
                                                                                            )
                                                                                                .toString()
                                                                                                .padStart(
                                                                                                    2,
                                                                                                    "0",
                                                                                                )}
                                                                                            onValueChange={(
                                                                                                val,
                                                                                            ) => {
                                                                                                const newDate =
                                                                                                    dateField.value
                                                                                                        ? new Date(
                                                                                                              dateField.value,
                                                                                                          )
                                                                                                        : new Date();
                                                                                                newDate.setMinutes(
                                                                                                    parseInt(
                                                                                                        val,
                                                                                                    ),
                                                                                                );
                                                                                                dateField.onChange(
                                                                                                    newDate,
                                                                                                );
                                                                                            }}
                                                                                        >
                                                                                            <SelectTrigger className="w-[65px] h-8 text-xs">
                                                                                                <SelectValue placeholder="Min" />
                                                                                            </SelectTrigger>
                                                                                            <SelectContent>
                                                                                                {[
                                                                                                    "00",
                                                                                                    "15",
                                                                                                    "30",
                                                                                                    "45",
                                                                                                ].map(
                                                                                                    (
                                                                                                        m,
                                                                                                    ) => (
                                                                                                        <SelectItem
                                                                                                            key={
                                                                                                                m
                                                                                                            }
                                                                                                            value={
                                                                                                                m
                                                                                                            }
                                                                                                        >
                                                                                                            {
                                                                                                                m
                                                                                                            }
                                                                                                        </SelectItem>
                                                                                                    ),
                                                                                                )}
                                                                                            </SelectContent>
                                                                                        </Select>
                                                                                        <Select
                                                                                            value={
                                                                                                (dateField.value?.getHours() ??
                                                                                                    12) >=
                                                                                                12
                                                                                                    ? "PM"
                                                                                                    : "AM"
                                                                                            }
                                                                                            onValueChange={(
                                                                                                val,
                                                                                            ) => {
                                                                                                const newDate =
                                                                                                    dateField.value
                                                                                                        ? new Date(
                                                                                                              dateField.value,
                                                                                                          )
                                                                                                        : new Date();
                                                                                                const currentHours =
                                                                                                    newDate.getHours();
                                                                                                let newHours =
                                                                                                    currentHours;
                                                                                                if (
                                                                                                    val ===
                                                                                                        "AM" &&
                                                                                                    currentHours >=
                                                                                                        12
                                                                                                )
                                                                                                    newHours -= 12;
                                                                                                if (
                                                                                                    val ===
                                                                                                        "PM" &&
                                                                                                    currentHours <
                                                                                                        12
                                                                                                )
                                                                                                    newHours += 12;
                                                                                                newDate.setHours(
                                                                                                    newHours,
                                                                                                );
                                                                                                dateField.onChange(
                                                                                                    newDate,
                                                                                                );
                                                                                            }}
                                                                                        >
                                                                                            <SelectTrigger className="w-[65px] h-8 text-xs">
                                                                                                <SelectValue placeholder="AM/PM" />
                                                                                            </SelectTrigger>
                                                                                            <SelectContent>
                                                                                                <SelectItem value="AM">
                                                                                                    AM
                                                                                                </SelectItem>
                                                                                                <SelectItem value="PM">
                                                                                                    PM
                                                                                                </SelectItem>
                                                                                            </SelectContent>
                                                                                        </Select>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </PopoverContent>
                                                                    </Popover>
                                                                    <FormDescription>
                                                                        Your
                                                                        video
                                                                        will be
                                                                        private
                                                                        until
                                                                        this
                                                                        date.
                                                                    </FormDescription>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </div>
                                                )}
                                            </FormItem>
                                        )}
                                    />

                                    {/* Schedule Logic can be complex, simplifying UI for now */}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            </form>
        </Form>
    );
}
