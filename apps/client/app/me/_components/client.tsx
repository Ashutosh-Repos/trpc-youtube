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
import { getMediaUrl } from "@/lib/utils";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useCallback } from "react";
import {
    EditableInput,
    EditableTextarea,
} from "@/components/custom/editable-field";

import { inferRouterOutputs } from "@trpc/server";
import { AppRouter } from "@youtube/server";

type User = inferRouterOutputs<AppRouter>["user"]["getProfile"];

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
            utils.user.getProfile.setData(
                undefined,
                (oldData: User | undefined) => {
                    if (!oldData) return undefined;
                    return {
                        ...oldData,
                        ...data,
                    };
                },
            );
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
            socialLinks:
                (userData.socialLinks as unknown as z.infer<
                    typeof profileSchema
                >["socialLinks"]) || [],
            businessInfo: (userData.businessInfo as unknown as z.infer<
                typeof profileSchema
            >["businessInfo"]) || {
                inquiryEmail: "",
            },
            contactInfo: (userData.contactInfo as unknown as z.infer<
                typeof profileSchema
            >["contactInfo"]) || {
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
            socialLinks:
                (userData.socialLinks as unknown as z.infer<
                    typeof profileSchema
                >["socialLinks"]) || [],
            businessInfo: (userData.businessInfo as unknown as z.infer<
                typeof profileSchema
            >["businessInfo"]) || {
                inquiryEmail: "",
            },
            contactInfo: (userData.contactInfo as unknown as z.infer<
                typeof profileSchema
            >["contactInfo"]) || {
                phone: "",
                address: "",
            },
        });
    }, [userData, form]);

    const onSubmit = useCallback(
        (values: z.infer<typeof profileSchema>) => {
            updateProfileMutation.mutate(values);
        },
        [updateProfileMutation],
    );

    const handleCancel = useCallback(() => {
        form.reset();
        setIsEditing(false);
    }, [form]);

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
    }, [isEditing, form, onSubmit, handleCancel]);

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
        userData.channels?.map(
            (
                channel: {
                    id: string;
                    name: string;
                    subscriberCount: number;
                    videoCount: number;
                    image: string | null;
                },
                idx: number,
            ) => ({
                id: idx + 1,
                originalId: channel.id,
                name: channel.name,
                designation: `${channel.subscriberCount} Subs • ${channel.videoCount} Videos`,
                image:
                    getMediaUrl(channel.image) ||
                    "https://github.com/shadcn.png",
                href: `/studio/${channel.id}`,
            }),
        ) || [];

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
                        className="w-full h-48 md:h-80 relative rounded-b-3xl overflow-hidden shadow-xl group"
                    >
                        {/* <div className="absolute inset-0 bg-linear-to-t from-background/90 via-background/20 to-transparent z-10 pointer-events-none" /> */}
                        <Image
                            src={resolvedBannerUrl}
                            alt="Banner"
                            fill
                            className="object-cover"
                            priority
                        />
                        <ImageUpload
                            type="banner"
                            onChange={(url) =>
                                handleImageUpdate("bannerUrl", url)
                            }
                            className="absolute inset-0 z-20"
                            variant="overlay"
                        />
                    </motion.div>

                    {/* Profile Header Content */}
                    <div className="max-w-7xl mx-auto px-6 relative z-30 -mt-20">
                        <div className="flex flex-col md:flex-row items-start gap-6">
                            {/* Avatar */}
                            <motion.div layout className="relative group">
                                <div className="w-32 h-32 md:w-48 md:h-48 rounded-full border-4 border-background p-1 bg-background overflow-hidden shadow-2xl ring-1 ring-white/10 relative">
                                    <Avatar className="w-full h-full">
                                        <AvatarImage
                                            src={getMediaUrl(userData.image)}
                                            className="object-cover"
                                        />
                                        <AvatarFallback className="text-4xl bg-muted">
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
                            <div className="flex-1 pt-4 md:pt-24 w-full bg-transparent space-y-6">
                                <div className="flex flex-col gap-6 ">
                                    {/* Name & Edit Toggle */}
                                    <div className="flex justify-between items-start gap-4">
                                        <div className="flex-1 max-w-2xl">
                                            <EditableInput
                                                name="name"
                                                isEditing={isEditing}
                                                autoFocus
                                                placeholder="Display Name"
                                                className="text-4xl font-black tracking-tight"
                                            />

                                            <div className="flex flex-wrap items-center gap-4 text-sm mt-2">
                                                <div
                                                    className="flex items-center gap-1.5"
                                                    title="Location"
                                                >
                                                    <MapPin className="w-4 h-4 shrink-0" />
                                                    <EditableInput
                                                        name="location"
                                                        isEditing={isEditing}
                                                        placeholder="Add location"
                                                        fallback="Not set"
                                                        className="font-medium"
                                                    />
                                                </div>

                                                <div
                                                    className="flex items-center gap-1.5"
                                                    title="Website"
                                                >
                                                    <Globe className="w-4 h-4 shrink-0" />
                                                    <EditableInput
                                                        name="websiteUrl"
                                                        isEditing={isEditing}
                                                        placeholder="Add website"
                                                        fallback="No website"
                                                        className="font-medium  hover:underline cursor-pointer"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex items-center gap-2">
                                            {isEditing ? (
                                                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={handleCancel}
                                                        disabled={isPending}
                                                        // className="text-white/60 hover:text-white"
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
                                                        // className="bg-primary text-primary-foreground hover:bg-primary/90"
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
                                                    // variant="secondary"
                                                    size="sm"
                                                    onClick={() =>
                                                        setIsEditing(true)
                                                    }
                                                    // className="bg-white/10 hover:bg-white/20 border border-white/10"
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
                                            className="leading-relaxed text-base"
                                        />
                                    </div>

                                    <div className="w-full h-px bg-white/5 my-2" />

                                    {/* Advanced Details Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl">
                                        {/* Contact & Business Info */}
                                        <div className="space-y-4">
                                            <h3 className="text-sm font-medium uppercase tracking-wider">
                                                Contact Info
                                            </h3>
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-3 text-sm">
                                                    <Mail className="w-4 h-4 text-white/40 shrink-0" />
                                                    <EditableInput
                                                        name="businessInfo.inquiryEmail"
                                                        isEditing={isEditing}
                                                        placeholder="Public Email"
                                                        fallback="No email set"
                                                    />
                                                </div>
                                                <div className="flex items-center gap-3 text-sm">
                                                    <div className="w-4 flex justify-center shrink-0">
                                                        <span className="text-xs font-bold">
                                                            P
                                                        </span>
                                                    </div>
                                                    <EditableInput
                                                        name="contactInfo.phone"
                                                        isEditing={isEditing}
                                                        placeholder="Phone Number"
                                                        fallback="No phone set"
                                                    />
                                                </div>
                                                <div className="flex items-center gap-3 text-sm ">
                                                    <div className="w-4 flex justify-center shrink-0">
                                                        <span className="text-xs font-bold">
                                                            A
                                                        </span>
                                                    </div>
                                                    <EditableInput
                                                        name="contactInfo.address"
                                                        isEditing={isEditing}
                                                        placeholder="Address"
                                                        fallback="No address set"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Social Links */}
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-sm font-medium uppercase tracking-wider">
                                                    Social Links
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
                                                        className="h-6 w-6 "
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                <AnimatePresence>
                                                    {socialFields.map(
                                                        (field, index) => (
                                                            <motion.div
                                                                key={field.id}
                                                                layout
                                                                initial={{
                                                                    opacity: 0,
                                                                    scale: 0.8,
                                                                }}
                                                                animate={{
                                                                    opacity: 1,
                                                                    scale: 1,
                                                                }}
                                                                exit={{
                                                                    opacity: 0,
                                                                    scale: 0.8,
                                                                }}
                                                                className={
                                                                    isEditing
                                                                        ? "w-full flex gap-2 mb-2"
                                                                        : ""
                                                                }
                                                            >
                                                                {isEditing ? (
                                                                    <div className="flex gap-2 w-full">
                                                                        <Input
                                                                            {...form.register(
                                                                                `socialLinks.${index}.platform`,
                                                                            )}
                                                                            placeholder="Platform (Twitter, etc)"
                                                                            className="flex-1 bg-white/5 border-white/10 h-8 text-xs"
                                                                        />
                                                                        <Input
                                                                            {...form.register(
                                                                                `socialLinks.${index}.url`,
                                                                            )}
                                                                            placeholder="URL"
                                                                            className="flex-2 bg-white/5 border-white/10 h-8 text-xs"
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
                                                                            className="h-8 w-8 hover:text-red-400 group/del"
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
                                                                        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all group/link"
                                                                    >
                                                                        <span className="transition-colors">
                                                                            {getPlatformIcon(
                                                                                form.getValues(
                                                                                    `socialLinks.${index}.platform`,
                                                                                ) ||
                                                                                    "",
                                                                            )}
                                                                        </span>
                                                                        <span className="text-xs font-medium">
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
                                                        <p className="text-sm italic">
                                                            No social links
                                                            added.
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
