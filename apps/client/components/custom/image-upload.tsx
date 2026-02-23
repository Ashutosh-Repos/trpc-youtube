"use client";

import { useState, useRef } from "react";
import { UploadCloud, X, Loader2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import { cn, getMediaUrl, MaxSizes, AllowedMimeTypes } from "@/lib/utils";
import { getPresignedUrl } from "@/lib/storage";
import { UploadType } from "@/lib/storage";

interface ImageUploadProps {
    value?: string;
    onChange: (url: string) => void;
    disabled?: boolean;
    type: UploadType;
    className?: string;
    onRemove?: () => void;
    variant?: "default" | "overlay";
}

export const ImageUpload = ({
    value,
    onChange,
    disabled,
    type,
    className,
    onRemove,
    variant = "default",
}: ImageUploadProps) => {
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // validation
        if (!AllowedMimeTypes[type].includes(file.type)) {
            toast.error("Invalid file type", {
                description: "Please upload a supported image format.",
            });
            return;
        }

        const maxSize = MaxSizes[type];
        if (file.size > maxSize) {
            toast.error(
                `File too large. Max size is ${maxSize / 1024 / 1024}MB.`,
            );
            return;
        }

        setIsUploading(true);

        try {
            // 1. Get Presigned URL
            const result = await getPresignedUrl(type, file.type, file.size);
            if (!result.success || !result.data) {
                throw new Error(result.error || "Failed to get upload URL");
            }

            const { url, key } = result.data;

            // 2. Upload to S3/MinIO
            const uploadResponse = await fetch(url, {
                method: "PUT",
                body: file,
                headers: {
                    "Content-Type": file.type,
                },
            });

            if (!uploadResponse.ok) {
                throw new Error("Failed to upload image to storage");
            }

            // 3. Update State with relative key
            onChange(key);
            toast.success("Image uploaded successfully");
        } catch (error) {
            console.error("Upload error:", error);
            toast.error("Something went wrong during upload");
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const triggerUpload = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        fileInputRef.current?.click();
    };

    return (
        <div className={cn("relative group overflow-hidden", className)}>
            <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileChange}
                disabled={disabled || isUploading}
            />

            {variant === "overlay" ? (
                <div
                    onClick={triggerUpload}
                    className="absolute inset-0 z-50 flex items-center justify-center bg-background/0 group-hover:bg-background/60 transition-all duration-300 cursor-pointer backdrop-blur-0 group-hover:backdrop-blur-sm"
                >
                    {isUploading ? (
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    ) : (
                        <div className="opacity-0 group-hover:opacity-100 transform scale-90 group-hover:scale-100 transition-all duration-500 bg-surface-3/80 backdrop-blur-xl p-4 rounded-3xl text-foreground border border-border/40 shadow-2xl">
                            <ImageIcon className="w-6 h-6" />
                        </div>
                    )}
                </div>
            ) : value ? (
                <>
                    <Image
                        src={getMediaUrl(value)}
                        alt="Upload"
                        fill
                        className="object-cover"
                    />
                    <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-all duration-500 flex items-center justify-center gap-3 backdrop-blur-sm">
                        <button
                            type="button"
                            onClick={triggerUpload}
                            disabled={disabled || isUploading}
                            className="bg-surface-3/80 backdrop-blur-xl p-3 rounded-2xl hover:bg-primary hover:text-primary-foreground border border-border/40 text-foreground transition-all shadow-xl active:scale-90"
                        >
                            <UploadCloud className="w-5 h-5" />
                        </button>
                        {onRemove && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRemove();
                                }}
                                disabled={disabled || isUploading}
                                className="bg-destructive/80 backdrop-blur-xl p-3 rounded-2xl hover:bg-destructive text-destructive-foreground transition-all shadow-xl active:scale-90"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </>
            ) : (
                <button
                    type="button"
                    onClick={triggerUpload}
                    disabled={disabled || isUploading}
                    className="flex flex-col items-center justify-center w-full h-full text-muted-foreground/60 bg-surface-1/40 hover:bg-surface-1/80 transition-all duration-500 border-2 border-dashed border-border/20 hover:border-primary/40 rounded-[32px] font-sans group/btn shadow-inner"
                >
                    {isUploading ? (
                        <div className="flex flex-col items-center animate-pulse">
                            <Loader2 className="w-10 h-10 animate-spin mb-3 text-primary" />
                            <span className="text-[11px] font-black uppercase tracking-widest">
                                Uploading...
                            </span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center transition-transform duration-500 group-hover/btn:scale-105">
                            {type === "avatar" ? (
                                <div className="p-4 rounded-full bg-primary/5 mb-3">
                                    <ImageIcon className="w-10 h-10 text-primary/40 group-hover/btn:text-primary transition-colors" />
                                </div>
                            ) : (
                                <div className="p-6 rounded-[24px] bg-primary/5 mb-4 border border-primary/5">
                                    <UploadCloud className="w-12 h-12 text-primary/40 group-hover/btn:text-primary transition-colors" />
                                </div>
                            )}
                            <span className="text-[11px] font-black uppercase tracking-[0.2em]">
                                {isUploading ? "Uploading..." : "Select File"}
                            </span>
                        </div>
                    )}
                </button>
            )}
        </div>
    );
};
