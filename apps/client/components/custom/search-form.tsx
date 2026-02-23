"use client";

import React, { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormMessage,
} from "@/components/ui/form";

import { IconMicrophone, IconSearch, IconX } from "@tabler/icons-react";
import { SearchIcon } from "@/components/ui/search";
import { MicIcon } from "@/components/ui/mic";
import { MicIconHandle } from "@/components/ui/mic";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { useClkOut } from "@/hooks/useClkOut";
import { toast } from "sonner";

// ---- Zod Schema ----
const FormSchema = z.object({
    query: z.string().min(1, "Please enter or speak a query"),
});

export function SearchForm() {
    const router = useRouter();
    const form = useForm<z.infer<typeof FormSchema>>({
        resolver: zodResolver(FormSchema),
        defaultValues: { query: "" },
    });

    const [listening, setListening] = useState(false);
    const [spokenText, setSpokenText] = useState(""); // ✅ preview state
    const recognitionRef = useRef<SpeechRecognition | null>(null);

    const micIconRef = useRef<MicIconHandle>(null);

    // ✅ Setup SpeechRecognition once
    useEffect(() => {
        if (typeof window === "undefined") return;

        const SpeechRecognition =
            (window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition;

        if (SpeechRecognition && !recognitionRef.current) {
            const recognition = new SpeechRecognition();

            recognition.lang = "en-US";
            recognition.interimResults = true; // ✅ allow partial results
            recognition.continuous = false;

            recognition.onresult = (event: SpeechRecognitionEvent) => {
                const text = Array.from(event.results)
                    .map((result: any) => result[0]?.transcript || "")
                    .join("");
                setSpokenText(text); // live preview
                if (event.results[0]?.isFinal) {
                    form.setValue("query", text);
                }
            };

            recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
                if (event.error === "aborted" || event.error === "no-speech") {
                    // User clicked cancel → not a real error
                    return;
                }
                console.error("Speech recognition error:", event.error);
                setListening(false);
                setSpokenText("");
            };
            // ✅ Auto-submit only if valid, else reset
            recognition.onend = () => {
                const query = form.getValues("query").trim();
                if (query && query.length > 0) {
                    form.handleSubmit(onSubmit)();
                }
                cancelListening();
            };

            recognitionRef.current = recognition;
        }
    }, [form]);

    const startListening = () => {
        const recognition = recognitionRef.current;
        micIconRef.current?.startAnimation();
        if (!recognition) {
            alert("Speech recognition not supported in this browser.");
            return;
        }
        form.setValue("query", "");
        setSpokenText("");
        recognition.start();
        setListening(true);
    };

    const cancelListening = () => {
        const recognition = recognitionRef.current;
        if (recognition) recognition.abort();
        form.reset();
        setSpokenText("");
        setListening(false);
        micIconRef.current?.stopAnimation();
    };

    function onSubmit(data: z.infer<typeof FormSchema>) {
        const cleanQuery = data.query.trim();
        if (!cleanQuery) {
            toast.warning("Please enter a valid search query");
            return;
        }
        router.push(`/search?q=${encodeURIComponent(cleanQuery)}`);
        setFormActive(false);
    }

    const [isFormActive, setFormActive] = useState<boolean>(false);

    const ref = useRef<HTMLFormElement>(null);
    useClkOut(ref, () => setFormActive(false), isFormActive);
    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className={cn(
                    "flex items-center justify-center gap-1 rounded w-full h-full  relative sm:bg-transparent max-sm:absolute sm:max-w-lg bg-background max-sm:pl-4 max-sm:z-20 sm:pr-2 sm:border-r",
                    !isFormActive && " max-sm:hidden",
                )}
                ref={ref}
            >
                {/* Search Input */}
                <MicIcon
                    size={20}
                    ref={micIconRef}
                    className="border p-2 rounded-full cursor-pointer"
                    onClick={() => {
                        listening ? cancelListening() : startListening();
                    }}
                />
                <FormField
                    control={form.control}
                    name="query"
                    render={({ field }) => (
                        <FormItem className="flex-1 relative w-max h-max">
                            <FormControl>
                                <span className="relative w-full h-full">
                                    <Input
                                        placeholder="Type or speak your query..."
                                        {...field}
                                        className="rounded-l-full rounded-r-full muted-foreground border-accent"
                                    />
                                    <span className="absolute w-auto h-full right-0 top-1/2 -translate-y-1/2 px-3 rounded-r-full cursor-pointer grid place-items-center bg-accent">
                                        <SearchIcon size={18} />
                                    </span>
                                </span>
                            </FormControl>

                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* Mic or Cancel Button */}
                {/* {!listening ? (
                    <IconMicrophone
                        onClick={startListening}
                        className="rounded-full bg-background hover:bg-accent border h-9 w-9 p-2 cursor-pointer"
                    />
                ) : (
                    <IconX
                        onClick={cancelListening}
                        className="rounded-full bg-background hover:bg-accent border h-9 w-9 p-2 cursor-pointer"
                    />
                )} */}

                {/* Spoken text preview */}
                {spokenText && (
                    <span className="absolute bottom-0 translate-y-full w-max h-max flex text-center origin-center z-20 border bg-transparent backdrop-blur-2xl p-1 px-2 rounded-full text-sm">
                        {spokenText}
                    </span>
                )}
            </form>
            {!isFormActive && (
                <SearchIcon
                    size={20}
                    className="rounded-full bg-background hover:bg-accent cursor-pointer sm:hidden"
                    onClick={() => setFormActive(!isFormActive)}
                />
            )}
        </Form>
    );
}
