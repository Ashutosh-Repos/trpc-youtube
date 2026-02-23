"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AnimatedTooltip } from "@/components/ui/animated-tooltip";
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
    Play,
    Loader2,
    Check,
    Plus,
    Trash2,
    Pencil,
    X,
} from "lucide-react";
import Link from "next/link";
import { ImageUpload } from "@/components/custom/image-upload";
import { cn, getMediaUrl } from "@/lib/utils";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import {
    EditableInput,
    EditableTextarea,
} from "@/components/custom/editable-field";
import { ActionResponse } from "@/lib/actions/schema-types";
import { getUserProfile } from "@/lib/actions/user"; // Keep generic type usage if needed

type User = NonNullable<
    Extract<
        Awaited<ReturnType<typeof getUserProfile>>,
        { success: true }
    >["data"]
>;

interface MePageContentProps {
    user: User;
}

// Helper to get icon for platform
const getPlatformIcon = (platform: string) => {
    const p = platform.toLowerCase();
    if (p.includes("twitter") || p.includes("x.com"))
        return <Twitter className="w-4 h-4" />;
    if (p.includes("github")) return <Github className="w-4 h-4" />;
    if (p.includes("instagram")) return <Instagram className="w-4 h-4" />;
    if (p.includes("linkedin")) return <Linkedin className="w-4 h-4" />;
    if (p.includes("stream") || p.includes("play"))
        return <Play className="w-4 h-4" />;
    return <LinkIcon className="w-4 h-4" />;
};

const socialLinkSchema = z.object({
    platform: z.string().min(1, "Platform required"),
    url: z.string().url("Invalid URL"),
    title: z.string().optional(),
});

const businessInfoSchema = z.object({
    inquiryEmail: z
        .string()
        .email("Invalid email")
        .optional()
        .or(z.literal("")),
});

const contactInfoSchema = z.object({
    phone: z.string().optional(),
    address: z.string().optional(),
});

const profileSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    bio: z.string().optional(),
    websiteUrl: z.string().url("Invalid URL").optional().or(z.literal("")),
    location: z.string().optional(),
    image: z.string().optional(),
    bannerUrl: z.string().optional(),
    socialLinks: z.array(socialLinkSchema).optional(),
    businessInfo: businessInfoSchema.optional(),
    contactInfo: contactInfoSchema.optional(),
});

const Client = ({ user }: MePageContentProps) => {
    const router = useRouter();
    const [isEditing, setIsEditing] = useState(false);

    // Use useQuery with initialData
    const { data: userData } = trpc.user.getProfile.useQuery(undefined, {
        initialData: user,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    });

    const utils = trpc.useUtils();

    const updateProfileMutation = trpc.user.updateProfile.useMutation({
        onSuccess: (data) => {
            toast.success("Changes saved");
            setIsEditing(false);
            utils.user.getProfile.setData(undefined, (oldData) => {
                if (!oldData) return undefined;
                return {
                    ...oldData,
                    ...data,
                };
            });
            router.refresh();
        },
        onError: (error) => {
            toast.error(error.message || "Failed to update profile");
        },
    });

    const isPending = updateProfileMutation.isPending;

    const form = useForm<z.infer<typeof profileSchema>>({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            name: userData.name || "",
            bio: userData.bio || "",
            websiteUrl: userData.websiteUrl || "",
            location: userData.location || "",
            image: userData.image || "",
            bannerUrl: userData.bannerUrl || "",
            socialLinks: (userData.socialLinks as any) || [],
            businessInfo: (userData.businessInfo as any) || {
                inquiryEmail: "",
            },
            contactInfo: (userData.contactInfo as any) || {
                phone: "",
                address: "",
            },
        },
    });

    const {
        fields: socialFields,
        append: appendSocial,
        remove: removeSocial,
    } = useFieldArray({
        control: form.control,
        name: "socialLinks",
    });

    // Reset form when userData updates
    useEffect(() => {
        form.reset({
            name: userData.name || "",
            bio: userData.bio || "",
            websiteUrl: userData.websiteUrl || "",
            location: userData.location || "",
            image: userData.image || "",
            bannerUrl: userData.bannerUrl || "",
            socialLinks: (userData.socialLinks as any) || [],
            businessInfo: (userData.businessInfo as any) || {
                inquiryEmail: "",
            },
            contactInfo: (userData.contactInfo as any) || {
                phone: "",
                address: "",
            },
        });
    }, [userData, form]);

    const onSubmit = (values: z.infer<typeof profileSchema>) => {
        updateProfileMutation.mutate(values);
    };

    const handleCancel = () => {
        form.reset();
        setIsEditing(false);
    };

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isEditing) return;

            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                e.preventDefault();
                form.handleSubmit(onSubmit)();
            }

            if (e.key === "Escape") {
                e.preventDefault();
                handleCancel();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isEditing, form]);

    // Handle Image Updates (Separate from main form submit)
    const handleImageUpdate = async (
        type: "image" | "bannerUrl",
        url: string,
    ) => {
        updateProfileMutation.mutate(
            { [type]: url },
            {
                onSuccess: () => {
                    toast.success(
                        `${type === "image" ? "Avatar" : "Banner"} updated`,
                    );
                    // No need to invalidate manually if we set query data but invalidation is safer
                    utils.user.getProfile.invalidate();
                    router.refresh();
                },
            },
        );
    };

    // Derived State
    const bannerUrl =
        userData.bannerUrl ||
        "https://images.unsplash.com/photo-1680071523030-802bb5195a30?q=80&w=2941&auto=format&fit=crop";

    const resolvedBannerUrl = getMediaUrl(bannerUrl);

    const channels =
        userData.channels?.map((channel: any, idx: number) => ({
            id: idx + 1,
            originalId: channel.id,
            name: channel.name,
            designation: `${channel.subscriberCount} Subs • ${channel.videoCount} Videos`,
            image:
                getMediaUrl(channel.image) || "https://github.com/shadcn.png",
            href: `/studio/${channel.id}`,
        })) || [];

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="w-full h-max bg-background"
            >
                <div className="relative w-full mb-12">
                    {/* Banner Section */}
                    <motion.div
                        layout
                        className="w-full h-48 md:h-80 relative rounded-b-[40px] overflow-hidden bg-surface-1 shadow-2xl group border-b border-white/5"
                    >
                        <Image
                            src={resolvedBannerUrl}
                            alt="Banner"
                            fill
                            className="object-cover transition-transform duration-1000 group-hover:scale-105 opacity-90"
                            priority
                        />
                        <ImageUpload
                            type="banner"
                            onChange={(url) =>
                                handleImageUpdate("bannerUrl", url)
                            }
                            className="absolute inset-0 z-20 backdrop-blur-sm bg-black/5"
                            variant="overlay"
                        />
                        <div className="absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-background to-transparent pointer-events-none" />
                    </motion.div>

                    {/* Profile Header Content */}
                    <div className="max-w-7xl mx-auto px-6 relative z-30 -mt-24">
                        <div className="flex flex-col md:flex-row items-start gap-8">
                            {/* Avatar */}
                            <motion.div layout className="relative group">
                                <div className="w-32 h-32 md:w-52 md:h-52 rounded-full border-[6px] border-background p-1 bg-surface-1 overflow-hidden shadow-2xl ring-1 ring-white/10 relative">
                                    <Avatar className="w-full h-full">
                                        <AvatarImage
                                            src={getMediaUrl(userData.image)}
                                            className="object-cover"
                                        />
                                        <AvatarFallback className="text-4xl bg-surface-2 font-black">
                                            {userData.name?.[0]}
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
                            </motion.div>

                            {/* Main Info Column */}
                            <div className="flex-1 pt-4 md:pt-28 w-full bg-transparent space-y-6">
                                <div className="flex flex-col gap-6">
                                    {/* Name & Edit Toggle */}
                                    <div className="flex justify-between items-start gap-4">
                                        <div className="flex-1 max-w-2xl">
                                            <EditableInput
                                                name="name"
                                                isEditing={isEditing}
                                                autoFocus
                                                placeholder="Display Name"
                                                className="text-5xl font-black tracking-tighter bg-linear-to-br from-foreground to-foreground/60 bg-clip-text text-transparent"
                                            />

                                            <div className="flex flex-wrap items-center gap-4 text-[13px] mt-3 uppercase tracking-widest font-bold text-muted-foreground/60">
                                                <div
                                                    className="flex items-center gap-1.5 hover:text-primary transition-colors cursor-default"
                                                    title="Location"
                                                >
                                                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                                                    <EditableInput
                                                        name="location"
                                                        isEditing={isEditing}
                                                        placeholder="Add location"
                                                        fallback="Not set"
                                                        className="font-bold"
                                                    />
                                                </div>

                                                <div
                                                    className="flex items-center gap-1.5 hover:text-primary transition-colors cursor-pointer"
                                                    title="Website"
                                                >
                                                    <Globe className="w-3.5 h-3.5 shrink-0" />
                                                    <EditableInput
                                                        name="websiteUrl"
                                                        isEditing={isEditing}
                                                        placeholder="Add website"
                                                        fallback="No website"
                                                        className="font-bold hover:underline"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex items-center gap-3">
                                            {isEditing ? (
                                                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={handleCancel}
                                                        disabled={isPending}
                                                        className="rounded-xl border border-border/40 hover:bg-surface-2"
                                                    >
                                                        <X className="w-4 h-4 mr-2" />
                                                        Cancel
                                                    </Button>
                                                    <Button
                                                        type="submit"
                                                        size="sm"
                                                        disabled={
                                                            isPending ||
                                                            !form.formState
                                                                .isDirty
                                                        }
                                                        className="rounded-xl bg-primary shadow-[0_0_20px_-5px_oklch(var(--primary)/0.5)]"
                                                    >
                                                        {isPending ? (
                                                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                                        ) : (
                                                            <Check className="w-4 h-4 mr-2" />
                                                        )}
                                                        Save
                                                    </Button>
                                                </div>
                                            ) : (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    onClick={() =>
                                                        setIsEditing(true)
                                                    }
                                                    className="rounded-xl bg-surface-2 border border-border/40 hover:bg-surface-3 transition-all font-bold tracking-tight shadow-sm"
                                                >
                                                    <Pencil className="w-4 h-4 mr-2" />
                                                    Edit Profile
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Bio */}
                                    <div className="max-w-2xl">
                                        <EditableTextarea
                                            name="bio"
                                            isEditing={isEditing}
                                            placeholder="Write something about yourself..."
                                            fallback="No bio yet."
                                            className="leading-relaxed text-lg font-medium text-foreground/80"
                                        />
                                    </div>

                                    <div className="w-full h-px bg-border/20 my-4" />

                                    {/* Advanced Details Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 max-w-4xl">
                                        {/* Contact & Business Info */}
                                        <div className="space-y-5">
                                            <h3 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/60">
                                                Contact & Inquiries
                                            </h3>
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-4 text-sm bg-surface-1/40 p-3 rounded-2xl border border-border/10">
                                                    <Mail className="w-4 h-4 text-primary shrink-0" />
                                                    <EditableInput
                                                        name="businessInfo.inquiryEmail"
                                                        isEditing={isEditing}
                                                        placeholder="Public Email"
                                                        fallback="No email set"
                                                        className="font-bold"
                                                    />
                                                </div>
                                                <div className="flex items-center gap-4 text-sm bg-surface-1/40 p-3 rounded-2xl border border-border/10">
                                                    <div className="w-4 flex justify-center shrink-0">
                                                        <span className="text-[10px] font-black text-secondary-brand uppercase tracking-tighter">
                                                            Tel
                                                        </span>
                                                    </div>
                                                    <EditableInput
                                                        name="contactInfo.phone"
                                                        isEditing={isEditing}
                                                        placeholder="Phone Number"
                                                        fallback="No phone set"
                                                        className="font-bold"
                                                    />
                                                </div>
                                                <div className="flex items-center gap-4 text-sm bg-surface-1/40 p-3 rounded-2xl border border-border/10">
                                                    <div className="w-4 flex justify-center shrink-0">
                                                        <MapPin className="w-4 h-4 text-tertiary" />
                                                    </div>
                                                    <EditableInput
                                                        name="contactInfo.address"
                                                        isEditing={isEditing}
                                                        placeholder="Address"
                                                        fallback="No address set"
                                                        className="font-bold"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Social Links */}
                                        <div className="space-y-5">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/60">
                                                    Social Ecosystem
                                                </h3>
                                                {isEditing && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() =>
                                                            appendSocial({
                                                                platform: "",
                                                                url: "",
                                                            })
                                                        }
                                                        className="h-7 w-7 bg-surface-2 border border-border/40 hover:bg-surface-3 rounded-lg"
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </div>

                                            <div className="flex flex-wrap gap-3">
                                                <AnimatePresence>
                                                    {socialFields.map(
                                                        (field, index) => (
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
                                                                className={
                                                                    isEditing
                                                                        ? "w-full flex gap-3 mb-2"
                                                                        : ""
                                                                }
                                                            >
                                                                {isEditing ? (
                                                                    <div className="flex gap-3 w-full bg-surface-2/40 p-3 rounded-2xl border border-border/40">
                                                                        <Input
                                                                            {...form.register(
                                                                                `socialLinks.${index}.platform`,
                                                                            )}
                                                                            placeholder="Platform"
                                                                            className="flex-1 bg-surface-3 border-border/20 h-10 text-xs font-bold rounded-xl"
                                                                        />
                                                                        <Input
                                                                            {...form.register(
                                                                                `socialLinks.${index}.url`,
                                                                            )}
                                                                            placeholder="URL"
                                                                            className="flex-2 bg-surface-3 border-border/20 h-10 text-xs font-bold rounded-xl"
                                                                        />
                                                                        <Button
                                                                            type="button"
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            onClick={() =>
                                                                                removeSocial(
                                                                                    index,
                                                                                )
                                                                            }
                                                                            className="h-10 w-10 hover:text-destructive group/del hover:bg-destructive/10 rounded-xl"
                                                                        >
                                                                            <Trash2 className="w-4 h-4 group-hover/del:scale-110 transition-transform" />
                                                                        </Button>
                                                                    </div>
                                                                ) : (
                                                                    <Link
                                                                        href={
                                                                            form.getValues(
                                                                                `socialLinks.${index}.url`,
                                                                            ) ||
                                                                            "#"
                                                                        }
                                                                        target="_blank"
                                                                        className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-surface-2 border border-border/40 hover:bg-surface-3 hover:border-primary/40 transition-all group/link shadow-sm hover:shadow-md hover:-translate-y-0.5"
                                                                    >
                                                                        <span className="transition-colors text-primary drop-shadow-[0_0_8px_oklch(var(--primary)/0.3)] group-hover/link:scale-110">
                                                                            {getPlatformIcon(
                                                                                form.getValues(
                                                                                    `socialLinks.${index}.platform`,
                                                                                ) ||
                                                                                    "",
                                                                            )}
                                                                        </span>
                                                                        <span className="text-[12px] font-black uppercase tracking-widest bg-linear-to-br from-foreground to-foreground/60 bg-clip-text text-transparent group-hover/link:from-primary group-hover/link:to-primary/60">
                                                                            {form.getValues(
                                                                                `socialLinks.${index}.platform`,
                                                                            )}
                                                                        </span>
                                                                    </Link>
                                                                )}
                                                            </motion.div>
                                                        ),
                                                    )}
                                                </AnimatePresence>

                                                {!isEditing &&
                                                    socialFields.length ===
                                                        0 && (
                                                        <p className="text-sm italic text-muted-foreground/60 w-full py-2">
                                                            No verified social
                                                            connections.
                                                        </p>
                                                    )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Channels Tooltip Section (Read Only) */}
                                    {channels.length > 0 && (
                                        <div className="my-2 w-full h-max">
                                            <h3 className="text-sm font-medium uppercase tracking-wider mb-2">
                                                Channels
                                            </h3>
                                            <div className="flex gap-2 w-full h-max">
                                                <AnimatedTooltip
                                                    items={channels}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </form>
        </Form>
    );
};

export default Client;
