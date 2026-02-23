"use client";

import { motion, AnimatePresence } from "motion/react";
import Image from "next/image";
import {
    Mail,
    MapPin,
    Globe,
    Link as LinkIcon,
    Twitter,
    Github,
    Instagram,
    Linkedin,
    Loader2,
    Check,
    Plus,
    Trash2,
    Pencil,
    X,
    Hash,
    AtSign,
    ExternalLink,
} from "lucide-react";
import { YoutubeIcon } from "@/components/ui/youtube";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useEffect, useCallback, useDeferredValue } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormMessage,
    FormDescription,
} from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

import { ImageUpload } from "@/components/custom/image-upload";
import {
    EditableInput,
    EditableTextarea,
} from "@/components/custom/editable-field";
import { trpc } from "@/lib/trpc";
import { updateChannelSchema } from "@/lib/actions/schema-types";
import { cn, getMediaUrl } from "@/lib/utils";
import { RouterOutputs } from "@/lib/trpc-shared";

interface StudioSettingsClientProps {
    channel: NonNullable<RouterOutputs["channel"]["getChannelById"]>["channel"];
}

const StudioSettingsClient = ({ channel }: StudioSettingsClientProps) => {
    const router = useRouter();
    const [isEditing, setIsEditing] = useState(false);
    const [handleStatus, setHandleStatus] = useState<
        "idle" | "checking" | "available" | "taken"
    >("idle");
    const [tagInput, setTagInput] = useState("");

    const utils = trpc.useUtils();
    // Use useQuery with initialData for instant load + reactive updates
    const { data } = trpc.channel.getChannelById.useQuery(
        { channelId: channel.id },
        {
            initialData: { success: true, channel },
            refetchOnMount: false,
            refetchOnWindowFocus: false,
        },
    );
    const channelData = data.channel;

    const updateChannelMutation = trpc.channel.updateChannel.useMutation({
        onSuccess: () => {
            toast.success("Channel updated successfully");
            setIsEditing(false);
            // Invalidate query to update local state immediately
            utils.channel.getChannelById.invalidate({ channelId: channel.id });
            // Refresh router to update server components (e.g. sidebar, header)
            router.refresh();
        },
        onError: (error) => {
            toast.error(error.message || "Failed to update channel");
        },
    });

    const isPending = updateChannelMutation.isPending;

    const form = useForm<z.infer<typeof updateChannelSchema>>({
        resolver: zodResolver(updateChannelSchema),
        defaultValues: {
            name: channelData.name || "",
            handle: channelData.handle || "",
            description: channelData.description || "",
            contactEmail: channelData.contactEmail || "",
            location: channelData.location || "",
            image: channelData.image || "",
            bannerUrl: channelData.bannerUrl || "",
            links: (channelData.links as any) || [],
            tags: channelData.tags?.map((t: { name: string }) => t.name) || [],
            featureFlags: (channelData.featureFlags as any) || {
                canUpload: true,
                canLiveStream: false,
            },
        },
    });

    const {
        fields: linkFields,
        append: appendLink,
        remove: removeLink,
    } = useFieldArray({
        control: form.control,
        name: "links",
    });

    const tags = form.watch("tags") || [];

    // Handle Availability Check via tRPC
    const currentHandle = form.watch("handle");
    const deferredHandle = useDeferredValue(currentHandle);

    const handleAvailabilityQuery =
        trpc.channel.checkHandleAvailability.useQuery(
            { handle: deferredHandle || "" },
            {
                enabled:
                    isEditing &&
                    !!deferredHandle &&
                    deferredHandle !== channelData.handle &&
                    deferredHandle.length >= 3,
            },
        );

    useEffect(() => {
        if (
            !isEditing ||
            !currentHandle ||
            currentHandle === channelData.handle
        ) {
            setHandleStatus("idle");
            return;
        }
        if (handleAvailabilityQuery.isFetching) {
            setHandleStatus("checking");
        } else if (handleAvailabilityQuery.data) {
            setHandleStatus(
                handleAvailabilityQuery.data.success ? "available" : "taken",
            );
        }
    }, [
        currentHandle,
        isEditing,
        channelData.handle,
        handleAvailabilityQuery.isFetching,
        handleAvailabilityQuery.data,
    ]);

    const onSubmit = (values: z.infer<typeof updateChannelSchema>) => {
        // Filter out empty links before saving
        const filteredLinks = values.links?.filter(
            (l: { title?: string; url?: string }) =>
                l.title?.trim() || l.url?.trim(),
        );

        updateChannelMutation.mutate({
            channelId: channel.id,
            ...values,
            links: filteredLinks as any,
        });
    };

    // Keyboard shortcut (Cmd+S)
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "s" && isEditing) {
                e.preventDefault();
                form.handleSubmit(onSubmit)();
            }
        },
        [isEditing, form.handleSubmit, onSubmit],
    );

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);

    const handleCancel = () => {
        form.reset();
        setIsEditing(false);
    };

    // Sync form with server data when query update (via invalidate or props)
    useEffect(() => {
        form.reset({
            name: channelData.name || "",
            handle: channelData.handle || "",
            description: channelData.description || "",
            contactEmail: channelData.contactEmail || "",
            location: channelData.location || "",
            image: channelData.image || "",
            bannerUrl: channelData.bannerUrl || "",
            links: (channelData.links as any) || [],
            tags: channelData.tags?.map((t: { name: string }) => t.name) || [],
            featureFlags: (channelData.featureFlags as any) || {
                canUpload: true,
                canLiveStream: false,
            },
        });
    }, [channelData, form]);

    const handleImageUpdate = async (
        type: "image" | "bannerUrl",
        url: string,
    ) => {
        // Optimistically update the form for instant UI feedback
        form.setValue(type, url, { shouldDirty: true });

        updateChannelMutation.mutate(
            { channelId: channel.id, [type]: url },
            {
                onSuccess: () => {
                    toast.success(
                        `${type === "image" ? "Avatar" : "Banner"} updated`,
                    );
                    utils.channel.getChannelById.invalidate({
                        channelId: channel.id,
                    });
                    router.refresh();
                },
                onError: (error) => {
                    // Revert on error (optional, but good for consistency)
                    // In this case, since we are doing a router refresh on success,
                    // the prop sync will handle eventual consistency, but reverting here is safer.
                    form.resetField(type);
                    toast.error(error.message || "Failed to update channel");
                },
            },
        );
    };

    // SEO Tag Helpers
    const addTag = () => {
        const trimmed = tagInput.trim().toLowerCase();
        if (trimmed && !tags.includes(trimmed)) {
            form.setValue("tags", [...tags, trimmed], { shouldDirty: true });
            setTagInput("");
        }
    };

    const removeTag = (tagToRemove: string) => {
        form.setValue(
            "tags",
            tags.filter((t: any) => t !== tagToRemove),
            { shouldDirty: true },
        );
    };

    const getPlatformIcon = (platform: string) => {
        const p = platform.toLowerCase();
        if (p.includes("twitter") || p.includes("x.com"))
            return <Twitter className="w-4 h-4" />;
        if (p.includes("github")) return <Github className="w-4 h-4" />;
        if (p.includes("instagram")) return <Instagram className="w-4 h-4" />;
        if (p.includes("linkedin")) return <Linkedin className="w-4 h-4" />;
        if (p.includes("youtube")) return <YoutubeIcon className="w-4 h-4" />;
        return <LinkIcon className="w-4 h-4" />;
    };

    const bannerUrl =
        form.watch("bannerUrl") ||
        "https://images.unsplash.com/photo-1680071523030-802bb5195a30?q=80&w=2941&auto=format&fit=crop";

    const resolvedBannerUrl = getMediaUrl(bannerUrl);

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="w-full flex flex-col gap-0 min-h-screen bg-background pb-20"
            >
                {/* Banner Section */}
                <div className="relative w-full h-48 md:h-72 group">
                    <Image
                        src={resolvedBannerUrl}
                        alt="Channel Banner"
                        fill
                        className="object-cover"
                        priority
                    />
                    <ImageUpload
                        type="banner"
                        onChange={(url) => handleImageUpdate("bannerUrl", url)}
                        className="absolute inset-0 z-20"
                        variant="overlay"
                    />
                </div>

                <div className="max-w-6xl mx-auto w-full px-6 -mt-16 relative z-30">
                    <div className="flex flex-col md:flex-row gap-8 items-start">
                        {/* Avatar */}
                        <div className="relative group shrink-0">
                            <div className="w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-background bg-background shadow-xl overflow-hidden relative ring-1 ring-border/40">
                                <Avatar className="w-full h-full">
                                    <AvatarImage
                                        src={
                                            getMediaUrl(form.watch("image")) ||
                                            undefined
                                        }
                                        className="object-cover"
                                    />
                                    <AvatarFallback className="text-4xl">
                                        {channelData.name?.[0]}
                                    </AvatarFallback>
                                </Avatar>
                                <ImageUpload
                                    type="avatar"
                                    onChange={(url) =>
                                        handleImageUpdate("image", url)
                                    }
                                    className="absolute inset-0 z-20 rounded-full"
                                    variant="overlay"
                                />
                            </div>
                        </div>

                        {/* Basic Info */}
                        <div className="flex-1 space-y-4 pt-16 md:pt-20">
                            <div className="flex justify-between items-start gap-4">
                                <div className="space-y-1 flex-1">
                                    <EditableInput
                                        name="name"
                                        isEditing={isEditing}
                                        placeholder="Channel Name"
                                        className="text-5xl font-black tracking-tighter uppercase text-foreground/90"
                                        autoFocus
                                    />
                                    <div className="flex items-center gap-2 text-muted-foreground ml-2 px-2">
                                        <AtSign className="w-4 h-4" />
                                        {isEditing ? (
                                            <FormField
                                                control={form.control}
                                                name="handle"
                                                render={({ field }) => (
                                                    <FormItem className="flex-1 space-y-0">
                                                        <FormControl>
                                                            <div className="flex items-center gap-2">
                                                                <Input
                                                                    {...field}
                                                                    className={cn(
                                                                        "h-10 text-sm font-medium bg-surface-2 border-border/10 rounded-xl transition-all focus-visible:ring-primary/20 focus-visible:border-primary/30",
                                                                        handleStatus ===
                                                                            "taken" &&
                                                                            "border-destructive focus-visible:ring-destructive/20",
                                                                        handleStatus ===
                                                                            "available" &&
                                                                            "border-emerald-500 focus-visible:ring-emerald-500/20",
                                                                    )}
                                                                />
                                                                {handleStatus ===
                                                                    "checking" && (
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                )}
                                                                {handleStatus ===
                                                                    "taken" && (
                                                                    <span className="text-[10px] text-destructive uppercase font-black tracking-widest">
                                                                        Taken
                                                                    </span>
                                                                )}
                                                                {handleStatus ===
                                                                    "available" && (
                                                                    <span className="text-[10px] text-emerald-500 uppercase font-black tracking-widest">
                                                                        Available
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </FormControl>
                                                        <FormMessage className="text-[10px] mt-1" />
                                                    </FormItem>
                                                )}
                                            />
                                        ) : (
                                            <div className="flex items-center gap-3">
                                                <span className="font-black text-sm uppercase tracking-widest text-foreground/80">
                                                    @{form.getValues("handle")}
                                                </span>
                                                <a
                                                    href={`/channel/@${form.getValues("handle")}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/80 transition-colors"
                                                >
                                                    View Channel{" "}
                                                    <ExternalLink className="w-3 h-3" />
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Controls */}
                                <div className="flex items-center gap-2">
                                    {isEditing ? (
                                        <>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleCancel}
                                                disabled={isPending}
                                                className="hover:bg-surface-2 font-black uppercase text-[11px] tracking-widest rounded-xl transition-all"
                                            >
                                                <X className="w-4 h-4 mr-2" />{" "}
                                                Cancel
                                            </Button>
                                            <Button
                                                type="submit"
                                                size="sm"
                                                disabled={
                                                    isPending ||
                                                    !form.formState.isDirty ||
                                                    handleStatus === "taken"
                                                }
                                                className="bg-primary hover:bg-primary/90 text-black font-black uppercase text-[11px] tracking-widest rounded-xl transition-all shadow-[0_0_20px_-5px_oklch(var(--primary)/0.4)]"
                                            >
                                                {isPending ? (
                                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                                ) : (
                                                    <Check className="w-4 h-4 mr-2" />
                                                )}
                                                Save Changes
                                            </Button>
                                        </>
                                    ) : (
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => setIsEditing(true)}
                                            className="bg-surface-2 hover:bg-surface-3 border border-border/10 text-foreground font-black uppercase text-[11px] tracking-widest rounded-xl transition-all h-10 px-6"
                                        >
                                            <Pencil className="w-4 h-4 mr-2 text-primary" />{" "}
                                            Edit Channel
                                        </Button>
                                    )}
                                </div>
                            </div>

                            <div className="max-w-3xl ml-2 px-2">
                                <EditableTextarea
                                    name="description"
                                    isEditing={isEditing}
                                    placeholder="Tell viewers about your channel..."
                                    className="text-sm leading-relaxed text-muted-foreground"
                                    fallback="No description set."
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 mt-12 pb-20">
                        {/* Discovery & Tags */}
                        <div className="lg:col-span-2 space-y-8">
                            <div className="space-y-4">
                                <h3 className="text-[11px] font-black uppercase tracking-widest flex items-center gap-2 text-foreground/40">
                                    <Hash className="w-4 h-4 text-primary" />{" "}
                                    SEO Tags
                                </h3>
                                <div className="p-8 rounded-2xl bg-surface-1 border border-border/10 space-y-6 shadow-xl">
                                    {isEditing && (
                                        <div className="flex gap-2">
                                            <Input
                                                placeholder="Add a search tag (e.g. gaming, tutorials)"
                                                value={tagInput}
                                                onChange={(e) =>
                                                    setTagInput(e.target.value)
                                                }
                                                onKeyDown={(e) =>
                                                    e.key === "Enter" &&
                                                    (e.preventDefault(),
                                                    addTag())
                                                }
                                                className="bg-surface-2 border-border/10 rounded-xl focus-visible:ring-primary/20"
                                            />
                                            <Button
                                                type="button"
                                                onClick={addTag}
                                                variant="secondary"
                                                className="rounded-xl font-black uppercase text-[11px] tracking-widest bg-primary/10 text-primary hover:bg-primary/20 px-6"
                                            >
                                                Add
                                            </Button>
                                        </div>
                                    )}
                                    <div className="flex flex-wrap gap-2">
                                        {tags.map((tag: string) => (
                                            <Badge
                                                key={tag}
                                                variant="secondary"
                                                className="px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 border-transparent transition-all gap-2 rounded-lg font-bold text-[10px] uppercase tracking-wider"
                                            >
                                                {tag}
                                                {isEditing && (
                                                    <X
                                                        className="w-3 h-3 cursor-pointer opacity-60 hover:opacity-100 hover:text-destructive"
                                                        onClick={() =>
                                                            removeTag(tag)
                                                        }
                                                    />
                                                )}
                                            </Badge>
                                        ))}
                                        {tags.length === 0 && (
                                            <p className="text-sm text-muted-foreground italic">
                                                No tags added for discovery.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Social Links */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-[11px] font-black uppercase tracking-widest flex items-center gap-2 text-foreground/40">
                                        <LinkIcon className="w-4 h-4 text-primary" />{" "}
                                        Links
                                    </h3>
                                    {isEditing && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                                appendLink({
                                                    title: "",
                                                    url: "",
                                                })
                                            }
                                        >
                                            <Plus className="w-4 h-4 mr-2" />{" "}
                                            Add Link
                                        </Button>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <AnimatePresence>
                                        {linkFields.map(
                                            (field: any, index: number) => (
                                                <motion.div
                                                    key={field.id}
                                                    layout
                                                    initial={{
                                                        opacity: 0,
                                                        y: 10,
                                                    }}
                                                    animate={{
                                                        opacity: 1,
                                                        y: 0,
                                                    }}
                                                    exit={{
                                                        opacity: 0,
                                                        scale: 0.95,
                                                    }}
                                                    className="p-6 rounded-2xl bg-surface-1 border border-border/10 group/link shadow-xl"
                                                >
                                                    {isEditing ? (
                                                        <div className="space-y-3">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">
                                                                    Link #
                                                                    {index + 1}
                                                                </span>
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 text-destructive/40 hover:text-destructive hover:bg-destructive/10 rounded-full transition-all"
                                                                    onClick={() =>
                                                                        removeLink(
                                                                            index,
                                                                        )
                                                                    }
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </Button>
                                                            </div>
                                                            <Input
                                                                {...form.register(
                                                                    `links.${index}.title`,
                                                                )}
                                                                placeholder="Title (e.g. Website)"
                                                                className="h-10 text-sm bg-surface-2 border-border/10 rounded-xl focus-visible:ring-primary/20"
                                                            />
                                                            <Input
                                                                {...form.register(
                                                                    `links.${index}.url`,
                                                                )}
                                                                placeholder="https://..."
                                                                className="h-10 text-sm bg-surface-2 border-border/10 rounded-xl focus-visible:ring-primary/20"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <a
                                                            href={form.getValues(
                                                                `links.${index}.url`,
                                                            )}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="flex items-center gap-3"
                                                            onClick={(e) => {
                                                                // Prevent navigation if no url
                                                                if (
                                                                    !form.getValues(
                                                                        `links.${index}.url`,
                                                                    )
                                                                )
                                                                    e.preventDefault();
                                                            }}
                                                        >
                                                            <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover/link:bg-primary/20 transition-all">
                                                                {getPlatformIcon(
                                                                    form.getValues(
                                                                        `links.${index}.title`,
                                                                    ) || "",
                                                                )}
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-bold">
                                                                    {form.getValues(
                                                                        `links.${index}.title`,
                                                                    )}
                                                                </p>
                                                                <p className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                                                                    {form.getValues(
                                                                        `links.${index}.url`,
                                                                    )}
                                                                </p>
                                                            </div>
                                                        </a>
                                                    )}
                                                </motion.div>
                                            ),
                                        )}
                                    </AnimatePresence>
                                    {linkFields.length === 0 && !isEditing && (
                                        <div className="col-span-full py-8 text-center border-2 border-dashed border-white/5 rounded-2xl">
                                            <p className="text-sm text-muted-foreground">
                                                No links added to your channel.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Sidebar Info */}
                        <div className="space-y-8 lg:sticky lg:top-24 h-fit">
                            <div className="space-y-4">
                                <h3 className="text-[11px] font-black uppercase tracking-widest text-foreground/40">
                                    Contact Info
                                </h3>
                                <div className="space-y-6 p-8 rounded-2xl bg-surface-1 border border-border/10 shadow-xl">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest ml-1">
                                            Business Inquiry Email
                                        </label>
                                        <div className="flex items-center gap-3">
                                            <Mail className="w-4 h-4 text-primary shrink-0" />
                                            <EditableInput
                                                name="contactEmail"
                                                isEditing={isEditing}
                                                placeholder="Email"
                                                fallback="Not provided"
                                                className="text-sm font-medium"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest ml-1">
                                            Location
                                        </label>
                                        <div className="flex items-center gap-3">
                                            <MapPin className="w-4 h-4 text-primary shrink-0" />
                                            <EditableInput
                                                name="location"
                                                isEditing={isEditing}
                                                placeholder="City, Country"
                                                fallback="Not set"
                                                className="text-sm font-medium"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-8 rounded-2xl bg-linear-to-br from-primary/10 to-transparent border border-primary/10 space-y-6 shadow-xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-primary/10 transition-all duration-500" />
                                <h3 className="text-[11px] font-black uppercase tracking-widest text-primary">
                                    Channel Stats
                                </h3>
                                <div className="grid grid-cols-3 gap-6 relative z-10">
                                    <div className="text-center">
                                        <p className="text-2xl font-black tracking-tighter">
                                            {channelData.subscriberCount}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground/60 font-black uppercase tracking-widest mt-1">
                                            Subs
                                        </p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-2xl font-black tracking-tighter">
                                            {channelData.videoCount}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground/60 font-black uppercase tracking-widest mt-1">
                                            Videos
                                        </p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-2xl font-black tracking-tighter">
                                            {channelData.totalViews}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground/60 font-black uppercase tracking-widest mt-1">
                                            Views
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </form>
        </Form>
    );
};

export default StudioSettingsClient;
