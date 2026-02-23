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
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">
                    {label}
                </label>
            )}

            <div
                className={cn(
                    "relative flex flex-col items-center justify-center border-2 border-dashed rounded-2xl transition-all cursor-pointer hover:bg-surface-2/50 group/upload",
                    error
                        ? "border-destructive/50 bg-destructive/5"
                        : "border-border/10 bg-surface-1",
                    type === "banner" || type === "channel-banner"
                        ? "h-48 w-full"
                        : "h-36 w-36",
                    value ? "border-none p-0 overflow-hidden shadow-xl" : "p-8",
                )}
                onClick={!value ? triggerSelect : undefined}
            >
                {isUploading ? (
                    <div className="flex flex-col items-center gap-3 text-primary">
                        <Loader2 className="h-8 w-8 animate-spin" />
                        <span className="text-[10px] font-black uppercase tracking-widest">
                            Uploading...
                        </span>
                    </div>
                ) : value ? (
                    <div className="relative w-full h-full group/preview">
                        <img
                            src={getMediaUrl(value)}
                            alt="Preview"
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-background/60 backdrop-blur-md opacity-0 group-hover/preview:opacity-100 transition-all flex items-center justify-center">
                            <Button
                                size="icon"
                                variant="destructive"
                                className="h-10 w-10 rounded-full shadow-2xl scale-90 group-hover/preview:scale-100 transition-transform"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    clearImage();
                                }}
                            >
                                <X className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-4 text-center">
                        <div className="p-4 rounded-2xl bg-surface-2 text-muted-foreground/40 group-hover/upload:bg-primary/10 group-hover/upload:text-primary transition-all">
                            {String(type).includes("avatar") ||
                            String(type).includes("logo") ? (
                                <ImageIcon className="h-10 w-10" />
                            ) : (
                                <Upload className="h-10 w-10" />
                            )}
                        </div>
                        <div className="space-y-1">
                            <p className="text-[11px] font-black uppercase tracking-widest text-foreground/80 group-hover/upload:text-primary transition-colors">
                                Click to upload
                            </p>
                            {validationText && (
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">
                                    {validationText}
                                </p>
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
                <p className="text-[10px] text-destructive font-black uppercase tracking-widest">
                    {error}
                </p>
            )}
        </div>
    );
}
