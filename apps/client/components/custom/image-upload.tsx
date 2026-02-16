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
                    className="absolute inset-0 z-50 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-all duration-200 cursor-pointer"
                >
                    {isUploading ? (
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                    ) : (
                        <div className="opacity-0 group-hover:opacity-100 transform scale-90 group-hover:scale-100 transition-all duration-200 bg-black/50 backdrop-blur-md p-3 rounded-full text-white">
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
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                            type="button"
                            onClick={triggerUpload}
                            disabled={disabled || isUploading}
                            className="bg-white/10 backdrop-blur-md p-2 rounded-full hover:bg-white/20 text-white transition-colors"
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
                                className="bg-red-500/80 backdrop-blur-md p-2 rounded-full hover:bg-red-600 text-white transition-colors"
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
                    className="flex flex-col items-center justify-center w-full h-full text-muted-foreground bg-white/5 hover:bg-white/10 transition-colors border-2 border-dashed border-white/10 hover:border-white/20 rounded-xl"
                >
                    {isUploading ? (
                        <Loader2 className="w-8 h-8 animate-spin mb-2" />
                    ) : (
                        <div className="flex flex-col items-center">
                            {type === "avatar" ? (
                                <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                            ) : (
                                <UploadCloud className="w-10 h-10 mb-2 opacity-50" />
                            )}
                            <span className="text-xs font-medium">
                                {isUploading
                                    ? "Uploading..."
                                    : "Click to upload"}
                            </span>
                        </div>
                    )}
                </button>
            )}
        </div>
    );
};
