"use client";

import { useRef, useEffect, useState } from "react";
import { useFormContext } from "react-hook-form";
import {
    FormControl,
    FormField,
    FormItem,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";

interface EditableFieldProps {
    name: string;
    isEditing: boolean;
    className?: string; // Shared typography styles
    placeholder?: string;
    fallback?: string; // What to show if empty in read mode
    autoFocus?: boolean;
}

export const EditableInput = ({
    name,
    isEditing,
    className,
    placeholder,
    fallback,
    autoFocus,
}: EditableFieldProps) => {
    const { control, watch } = useFormContext();
    const value = watch(name);
    const hasValue = value && String(value).trim().length > 0;

    // Use Framer Motion for smooth layout transitions
    return (
        <div className="relative group w-full ml-2 px-2">
            {isEditing ? (
                <FormField
                    control={control}
                    name={name}
                    render={({ field }) => (
                        <FormItem className="space-y-0">
                            <FormControl>
                                <motion.div
                                    layout
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="relative"
                                >
                                    <Input
                                        {...field}
                                        placeholder={placeholder}
                                        autoFocus={autoFocus}
                                        className={cn(
                                            "border focus-visible:ring-1 focus-visible:ring-white/20 transition-all px-2 -ml-2 w-[calc(100%+16px)] h-auto py-1",
                                            className,
                                        )}
                                    />
                                </motion.div>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            ) : (
                <motion.div
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={cn(
                        "py-1 break-words empty:hidden min-h-[1.5em]",
                        className,
                    )}
                >
                    {hasValue ? value : fallback || null}
                </motion.div>
            )}
        </div>
    );
};

export const EditableTextarea = ({
    name,
    isEditing,
    className,
    placeholder,
    fallback,
    autoFocus,
}: EditableFieldProps) => {
    const { control, watch } = useFormContext();
    const value = watch(name);
    const hasValue = value && String(value).trim().length > 0;
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isOverflowing, setIsOverflowing] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    // Auto-resize textarea in edit mode
    useEffect(() => {
        if (isEditing && textareaRef.current) {
            const textarea = textareaRef.current;
            textarea.style.height = "auto";
            textarea.style.height = `${textarea.scrollHeight}px`;
        }
    }, [value, isEditing]);

    // Check for overflow in read mode
    useEffect(() => {
        if (!isEditing && contentRef.current && hasValue) {
            const el = contentRef.current;
            // Check if scrollHeight is significantly larger than clientHeight
            // We use a small buffer (e.g. 1px) to avoid precision issues
            setIsOverflowing(el.scrollHeight > el.clientHeight + 1);
        }
    }, [value, isEditing, hasValue]);

    return (
        <div className="relative group w-full">
            {isEditing ? (
                <FormField
                    control={control}
                    name={name}
                    render={({ field }) => (
                        <FormItem className="space-y-0">
                            <FormControl>
                                <motion.div
                                    layout
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                >
                                    <Textarea
                                        {...field}
                                        ref={(e) => {
                                            field.ref(e);
                                            // @ts-ignore
                                            textareaRef.current = e;
                                        }}
                                        placeholder={placeholder}
                                        autoFocus={autoFocus}
                                        className={cn(
                                            "border focus-visible:ring-1 focus-visible:ring-white/20 transition-all px-2 -ml-2 w-[calc(100%+16px)] resize-none overflow-hidden",
                                            className,
                                        )}
                                        rows={1}
                                    />
                                </motion.div>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            ) : (
                <div className="relative">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        ref={contentRef}
                        className={cn(
                            "whitespace-pre-wrap break-words py-1",
                            !isExpanded &&
                                "line-clamp-5 max-h-[7.5em] overflow-hidden", // 1.5em * 5 lines = 7.5em approx
                            className,
                        )}
                    >
                        {hasValue ? value : fallback || null}
                    </motion.div>
                    {isOverflowing && !isExpanded && (
                        <button
                            type="button"
                            onClick={() => setIsExpanded(true)}
                            className="text-sm text-muted-foreground hover:text-primary font-medium mt-1 focus:outline-hidden"
                        >
                            ... See more
                        </button>
                    )}
                    {isExpanded && isOverflowing && (
                        <button
                            type="button"
                            onClick={() => setIsExpanded(false)}
                            className="text-sm text-muted-foreground hover:text-primary font-medium mt-1 focus:outline-hidden"
                        >
                            Show less
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
