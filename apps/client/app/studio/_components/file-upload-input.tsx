"use client";

import { useState, useRef, ChangeEvent } from "react";
import { Upload, X, Image as ImageIcon, Loader2 } from "lucide-react";
import { getPresignedUrl } from "@/lib/storage";
import { UploadType, getMediaUrl } from "@/lib/utils";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";

interface FileUploadInputProps {
    value?: string;
    onChange: (url: string) => void;
    type: UploadType;
    label?: string;
    className?: string;
    // Validation Props
    aspectRatio?: number; // e.g., 1 (1:1), 16/9 (16:9)
    minWidth?: number;
    minHeight?: number;
    exactDimensions?: { width: number; height: number };
}

export function FileUploadInput({
    value,
    onChange,
    type,
    label,
    className,
    aspectRatio,
    minWidth,
    minHeight,
    exactDimensions,
}: FileUploadInputProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const validateImage = (file: File): Promise<void> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);

            img.onload = () => {
                URL.revokeObjectURL(url);

                // Check Exact Dimensions
                if (exactDimensions) {
                    if (
                        img.width !== exactDimensions.width ||
                        img.height !== exactDimensions.height
                    ) {
                        reject(
                            new Error(
                                `Image must be exactly ${exactDimensions.width}x${exactDimensions.height} pixels.`,
                            ),
                        );
                        return;
                    }
                }

                // Check Min Dimensions
                if (minWidth && img.width < minWidth) {
                    reject(
                        new Error(
                            `Image width must be at least ${minWidth}px.`,
                        ),
                    );
                    return;
                }
                if (minHeight && img.height < minHeight) {
                    reject(
                        new Error(
                            `Image height must be at least ${minHeight}px.`,
                        ),
                    );
                    return;
                }

                // Check Aspect Ratio (allow small tolerance)
                if (aspectRatio) {
                    const ratio = img.width / img.height;
                    const tolerance = 0.05; // Accept small rounding differences
                    if (Math.abs(ratio - aspectRatio) > tolerance) {
                        // Calculate expected description
                        const expected =
                            aspectRatio === 1
                                ? "1:1"
                                : aspectRatio === 16 / 9
                                  ? "16:9"
                                  : `${aspectRatio}:1`;
                        reject(
                            new Error(
                                `Image aspect ratio must be ${expected}.`,
                            ),
                        );
                        return;
                    }
                }

                resolve();
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error("Invalid image file."));
            };

            img.src = url;
        });
    };

    const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setError(null);
        setIsUploading(true);

        try {
            // 0. Validate Image Dimensions/Ratio
            await validateImage(file);

            // 1. Get Presigned URL
            const presignResult = await getPresignedUrl(
                type,
                file.type,
                file.size,
            );

            if (!presignResult.success || !presignResult.data) {
                throw new Error(
                    presignResult.error || "Failed to initiate upload",
                );
            }

            const { url, key } = presignResult.data;

            // 2. Upload to S3/MinIO
            const uploadResponse = await fetch(url, {
                method: "PUT",
                body: file,
                headers: {
                    "Content-Type": file.type,
                },
            });

            if (!uploadResponse.ok) {
                throw new Error("Failed to upload file to storage");
            }

            // 3. Update Parent
            onChange(key);
        } catch (err) {
            // client-side validation or server errors are shown in UI
            setError(err instanceof Error ? err.message : "Upload failed");
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const clearImage = () => {
        onChange("");
        setError(null);
    };

    const triggerSelect = () => {
        fileInputRef.current?.click();
    };

    // Helper description for validation reqs
    const validationText = [
        aspectRatio
            ? `Ratio: ${aspectRatio === 1 ? "1:1" : aspectRatio === 16 / 9 ? "16:9" : aspectRatio}`
            : "",
        exactDimensions
            ? `${exactDimensions.width}x${exactDimensions.height}px`
            : "",
        minWidth ? `Min ${minWidth}px width` : "",
    ]
        .filter(Boolean)
        .join(" • ");

    return (
        <div className={cn("space-y-2", className)}>
            {label && (
                <label className="text-sm font-medium leading-none">
                    {label}
                </label>
            )}

            <div
                className={cn(
                    "relative flex flex-col items-center justify-center border-2 border-dashed rounded-lg transition-all cursor-pointer hover:bg-muted/50",
                    error
                        ? "border-red-500 bg-red-50/10"
                        : "border-muted-foreground/25",
                    type === "banner" || type === "channel-banner"
                        ? "h-40 w-full aspect-video"
                        : "h-32 w-32",
                    value ? "border-none p-0 overflow-hidden" : "p-4",
                )}
                onClick={!value ? triggerSelect : undefined}
            >
                {isUploading ? (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        <span className="text-xs">Uploading...</span>
                    </div>
                ) : value ? (
                    <div className="relative w-full h-full group">
                        <img
                            src={getMediaUrl(value)}
                            alt="Preview"
                            className="w-full h-full object-cover rounded-md"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <Button
                                size="icon"
                                variant="destructive"
                                className="h-8 w-8 rounded-full"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    clearImage();
                                }}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground text-center">
                        {String(type).includes("avatar") ||
                        String(type).includes("logo") ? (
                            <ImageIcon className="h-8 w-8 opacity-50" />
                        ) : (
                            <Upload className="h-8 w-8 opacity-50" />
                        )}
                        <div className="text-xs">
                            <span className="font-semibold text-primary">
                                Click to upload
                            </span>
                            {validationText && (
                                <>
                                    <br />
                                    <span className="text-[10px] opacity-70">
                                        {validationText}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                )}

                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleFileSelect}
                    disabled={isUploading}
                />
            </div>

            {error && (
                <p className="text-xs text-red-500 font-medium">{error}</p>
            )}
        </div>
    );
}
