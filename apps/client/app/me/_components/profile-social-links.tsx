"use client";

import { motion, AnimatePresence } from "motion/react";
import {
    Link as LinkIcon,
    Twitter,
    Github,
    Instagram,
    Linkedin,
    Play,
    Plus,
    Trash2,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    useFieldArray,
    Control,
    UseFormGetValues,
    UseFormRegister,
} from "react-hook-form";

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

interface ProfileSocialLinksProps {
    isEditing: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    control: Control<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    register: UseFormRegister<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getValues: UseFormGetValues<any>;
}

export function ProfileSocialLinks({
    isEditing,
    control,
    register,
    getValues,
}: ProfileSocialLinksProps) {
    const {
        fields: socialFields,
        append: appendSocial,
        remove: removeSocial,
    } = useFieldArray({
        control,
        name: "socialLinks",
    });

    return (
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
                        onClick={() => appendSocial({ platform: "", url: "" })}
                        className="h-6 w-6"
                    >
                        <Plus className="w-4 h-4" />
                    </Button>
                )}
            </div>

            <div className="flex flex-wrap gap-2">
                <AnimatePresence>
                    {socialFields.map((field, index) => (
                        <motion.div
                            key={field.id}
                            layout
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className={
                                isEditing ? "w-full flex gap-2 mb-2" : ""
                            }
                        >
                            {isEditing ? (
                                <div className="flex gap-2 w-full">
                                    <Input
                                        {...register(
                                            `socialLinks.${index}.platform`,
                                        )}
                                        placeholder="Platform (Twitter, etc)"
                                        className="flex-1 bg-white/5 border-white/10 h-8 text-xs"
                                    />
                                    <Input
                                        {...register(
                                            `socialLinks.${index}.url`,
                                        )}
                                        placeholder="URL"
                                        className="flex-2 bg-white/5 border-white/10 h-8 text-xs"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeSocial(index)}
                                        className="h-8 w-8 hover:text-red-400 group/del"
                                    >
                                        <Trash2 className="w-4 h-4 group-hover/del:scale-110 transition-transform" />
                                    </Button>
                                </div>
                            ) : (
                                <Link
                                    href={
                                        getValues(`socialLinks.${index}.url`) ||
                                        "#"
                                    }
                                    target="_blank"
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all group/link"
                                >
                                    <span className="transition-colors">
                                        {getPlatformIcon(
                                            getValues(
                                                `socialLinks.${index}.platform`,
                                            ) || "",
                                        )}
                                    </span>
                                    <span className="text-xs font-medium">
                                        {getValues(
                                            `socialLinks.${index}.platform`,
                                        )}
                                    </span>
                                </Link>
                            )}
                        </motion.div>
                    ))}
                </AnimatePresence>

                {!isEditing && socialFields.length === 0 && (
                    <p className="text-sm italic">No social links added.</p>
                )}
            </div>
        </div>
    );
}
