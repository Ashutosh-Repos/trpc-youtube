"use client";
import z from "zod";

import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useModal } from "@/components/ui/animated-modal";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { Plus, Trash } from "lucide-react";

// We need to impart the type from the schema or redefine it if not exported correctly.
// Assuming createChannelSchema is available from the router or shared package.
// Actually, looking at the server router, it imports createChannelSchema from local definition in router file.
// But usually good practice is to share it.
// Let's redefine it here or import it if possible.
// The file viewed previously imported `createChannel` from `@/lib/actions/channel` which suggests it might have had a schema there.
// But the router has `export const createChannelSchema = z.object({...})`.
// Since I can't easily import from server/src/trpc/routers/channel.ts in client code (unless shared package),
// AND the previous code imported `createChannel` action but also `createChannelSchema` was used in `resolver: zodResolver(createChannelSchema)`.
// Wait, the previous code had `resolver: zodResolver(createChannelSchema)` but `createChannelSchema` was NOT defined in the file I viewed.
// It must have been imported from somewhere or missing.
// Ah, line 5 in original file: `import { createChannel } from "@/lib/actions/channel";`
// Maybe it was there? Or maybe it was a missing import in the snippet provided?
// The user request says "update this to use trpc router".
// I will define the schema here to match the server router for now, or use a Zod schema if I can find where it is legally shared.
// The task says "update this to use trpc router for channel stuff we wrote at server."
// Server router has the schema.
// I'll define it locally to be safe and match the server's validation.

const channelHandleRegex = /^[a-zA-Z0-9_.]+$/;
const linkSchema = z.object({
    title: z.string().trim().min(1).max(100),
    url: z.url(),
});

const createChannelSchema = z.object({
    name: z.string().trim().min(1).max(50),
    handle: z
        .string()
        .trim()
        .min(3)
        .max(30)
        .regex(
            channelHandleRegex,
            "Handle can only contain letters, numbers, underscores, and periods.",
        ),
    description: z.string().trim().max(5000).optional(),
    image: z.string().optional(),
    bannerUrl: z.string().optional(),
    contactEmail: z.email().optional(),
    links: z.array(linkSchema).max(20).optional(),
});

type CreateChannelType = z.infer<typeof createChannelSchema>;

import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
    FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, Loader2, X } from "lucide-react";
import { FileUploadInput } from "./file-upload-input"; // Assuming this exists or generic input

const steps = [
    { title: "Basic Info", fields: ["name", "handle", "description"] },
    { title: "Branding", fields: ["image", "bannerUrl"] },
    { title: "Contact & Links", fields: ["contactEmail", "links"] },
] as const;

const CreateChannelForm = () => {
    const [step, setStep] = useState(0);
    const { setOpen } = useModal();
    const router = useRouter();

    // tRPC mutations
    const createChannelMutation = trpc.channel.createChannel.useMutation({
        onSuccess: () => {
            setOpen(false);
            toast.success("Channel created successfully");
            router.refresh();
        },
        onError: (error) => {
            toast.error(error.message);
            form.setError("root", { message: error.message });
        },
    });

    const isPending = createChannelMutation.isPending;

    const form = useForm<CreateChannelType>({
        resolver: zodResolver(createChannelSchema),
        defaultValues: {
            name: "",
            handle: "",
            description: "",
            image: "",
            bannerUrl: "",
            contactEmail: "",
            links: [],
        },
        mode: "onChange",
    });

    const { control, trigger, handleSubmit, watch, setError, clearErrors } =
        form;

    const handleValue = watch("handle");
    const debouncedHandle = useDebounce(handleValue, 500);

    const { fields, append, remove } = useFieldArray({
        control,
        name: "links",
    });

    // Handle Availability Check using tRPC useQuery
    const { data: handleCheckData, isLoading: isCheckingHandle } =
        trpc.channel.checkHandleAvailability.useQuery(
            { handle: debouncedHandle },
            {
                enabled: !!debouncedHandle && debouncedHandle.length >= 3,
                retry: false,
            },
        );

    // Derived state for handle status
    let handleStatus: "idle" | "checking" | "available" | "taken" | "error" =
        "idle";
    let handleMessage = "";

    if (!debouncedHandle || debouncedHandle.length < 3) {
        handleStatus = "idle";
    } else if (isCheckingHandle) {
        handleStatus = "checking";
    } else if (handleCheckData?.success) {
        handleStatus = "available";
        handleMessage = "Handle is available";
    } else if (handleCheckData?.success === false) {
        handleStatus = "taken";
        handleMessage = "This handle is already taken";
    }
    // Note: If error occurs in useQuery, it might not return data.
    // We could use `isError` from useQuery but for now strict checking of success is enough.

    useEffect(() => {
        if (handleStatus === "taken") {
            setError("handle", {
                type: "manual",
                message: "This handle is already taken",
            });
        } else if (handleStatus === "available") {
            clearErrors("handle");
        }
    }, [handleStatus, setError, clearErrors]);

    async function next() {
        const fieldsToCheck = steps[step].fields as any;
        const valid = await trigger(fieldsToCheck);

        // Prevent moving forward if handle is taken in step 0
        if (step === 0 && handleStatus === "taken") {
            return;
        }

        if (!valid) return;
        setStep((s) => s + 1);
    }
    function back() {
        setStep((s) => s - 1);
    }

    const onSubmit = async (data: CreateChannelType) => {
        // Prevent early submission if not on the last step (e.g. user pressed Enter)
        if (step < steps.length - 1) {
            next();
            return;
        }
        if (handleStatus === "taken" || isCheckingHandle) return;

        createChannelMutation.mutate(data);
    };

    return (
        <Form {...form}>
            <form
                onSubmit={handleSubmit(onSubmit)}
                className="space-y-6 max-w-xl mx-auto w-full"
                onKeyDown={(e) => {
                    if (
                        e.key === "Enter" &&
                        e.target instanceof HTMLElement &&
                        e.target.tagName !== "TEXTAREA"
                    ) {
                        e.preventDefault();
                    }
                }}
            >
                <div className="mb-10 text-center space-y-2">
                    <h2 className="text-4xl font-black tracking-tighter uppercase text-foreground/90">
                        {steps[step].title}
                    </h2>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
                        Step {step + 1} of {steps.length}
                    </p>
                </div>

                {/* STEP 1 */}
                {step === 0 && (
                    <div className="space-y-4">
                        <FormField
                            control={control}
                            name="name"
                            render={({ field }) => (
                                <FormItem className="space-y-2">
                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">
                                        Channel Name
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            placeholder="My Awesome Channel"
                                            className="bg-surface-2 border-border/10 rounded-xl h-12 focus-visible:ring-primary/20 text-sm font-medium"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={control}
                            name="handle"
                            render={({ field }) => (
                                <FormItem className="space-y-2">
                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">
                                        Handle
                                    </FormLabel>
                                    <FormControl>
                                        <div className="relative">
                                            <Input
                                                {...field}
                                                placeholder="my_handle"
                                                className={cn(
                                                    "bg-surface-2 border-border/10 rounded-xl h-12 focus-visible:ring-primary/20 text-sm font-medium pr-10",
                                                    handleStatus === "taken" &&
                                                        "border-destructive focus-visible:ring-destructive/20",
                                                    handleStatus ===
                                                        "available" &&
                                                        "border-emerald-500 focus-visible:ring-emerald-500/20",
                                                )}
                                            />
                                            <div className="absolute right-3 top-2.5">
                                                {handleStatus ===
                                                    "checking" && (
                                                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                                )}
                                                {handleStatus ===
                                                    "available" && (
                                                    <Check className="h-4 w-4 text-emerald-500" />
                                                )}
                                                {handleStatus === "taken" && (
                                                    <X className="h-4 w-4 text-destructive" />
                                                )}
                                            </div>
                                        </div>
                                    </FormControl>
                                    <FormDescription>
                                        {handleMessage && (
                                            <span
                                                className={cn(
                                                    "text-[10px] font-black uppercase tracking-widest",
                                                    handleStatus === "available"
                                                        ? "text-emerald-500"
                                                        : handleStatus ===
                                                            "taken"
                                                          ? "text-destructive"
                                                          : "text-muted-foreground/40",
                                                )}
                                            >
                                                {handleMessage}
                                            </span>
                                        )}
                                        {!handleMessage &&
                                            "A unique URL handle; you can change this anytime"}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={control}
                            name="description"
                            render={({ field }) => (
                                <FormItem className="space-y-2">
                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">
                                        Description
                                    </FormLabel>
                                    <FormControl>
                                        <Textarea
                                            {...field}
                                            placeholder="Tell viewers about your channel..."
                                            className="bg-surface-2 border-border/10 rounded-xl min-h-[120px] focus-visible:ring-primary/20 text-sm font-medium resize-none"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                )}

                {/* STEP 2 */}
                {step === 1 && (
                    <div className="space-y-6">
                        <FormField
                            control={control}
                            name="image"
                            render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                        <FileUploadInput
                                            value={field.value}
                                            onChange={field.onChange}
                                            type="channel-logo"
                                            label="Channel Logo"
                                            aspectRatio={1}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        Recommended circular or square image
                                        (1:1).
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={control}
                            name="bannerUrl"
                            render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                        <FileUploadInput
                                            value={field.value}
                                            onChange={field.onChange}
                                            type="channel-banner"
                                            label="Channel Banner"
                                            exactDimensions={{
                                                width: 2560,
                                                height: 1440,
                                            }}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        Must be exactly 2560 x 1440 pixels.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                )}

                {/* STEP 3 */}
                {step === 2 && (
                    <div className="space-y-4">
                        <FormField
                            control={control}
                            name="contactEmail"
                            render={({ field }) => (
                                <FormItem className="space-y-2">
                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">
                                        Contact Email
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            type="email"
                                            placeholder="contact@example.com"
                                            className="bg-surface-2 border-border/10 rounded-xl h-12 focus-visible:ring-primary/20 text-sm font-medium"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">
                                    Links
                                </FormLabel>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                        append({ title: "", url: "" })
                                    }
                                    className="hover:bg-primary/10 text-primary font-black uppercase text-[10px] tracking-widest rounded-lg h-8 px-4"
                                >
                                    <Plus className="w-4 h-4 mr-2" /> Add Link
                                </Button>
                            </div>

                            {fields.map((field, i) => (
                                <div
                                    key={field.id}
                                    className="flex gap-2 items-start"
                                >
                                    <FormField
                                        control={control}
                                        name={`links.${i}.title`}
                                        render={({ field }) => (
                                            <FormItem className="flex-1">
                                                <FormControl>
                                                    <Input
                                                        {...field}
                                                        placeholder="Title"
                                                        className="h-10 text-sm bg-surface-2 border-border/10 rounded-xl focus-visible:ring-primary/20"
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name={`links.${i}.url`}
                                        render={({ field }) => (
                                            <FormItem className="grow-2 w-full">
                                                <FormControl>
                                                    <Input
                                                        {...field}
                                                        placeholder="https://..."
                                                        className="h-10 text-sm bg-surface-2 border-border/10 rounded-xl focus-visible:ring-primary/20"
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => remove(i)}
                                        className="h-10 w-10 text-destructive/40 hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all"
                                    >
                                        <Trash className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                            {fields.length === 0 && (
                                <p className="text-sm text-muted-foreground italic">
                                    No links added yet.
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {form.formState.errors.root && (
                    <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest border border-destructive/20">
                        {form.formState.errors.root.message}
                    </div>
                )}

                {/* FOOTER */}
                <div className="flex justify-between pt-6 border-t mt-6">
                    {step > 0 ? (
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={back}
                            className="hover:bg-surface-2 font-black uppercase text-[11px] tracking-widest rounded-xl transition-all h-12 px-8"
                        >
                            Back
                        </Button>
                    ) : (
                        <div /> // Spacer
                    )}

                    {step < steps.length - 1 ? (
                        <Button
                            type="button"
                            onClick={next}
                            disabled={
                                (step === 0 && handleStatus !== "available") ||
                                handleStatus === "checking" ||
                                handleStatus === "taken"
                            }
                            className="bg-primary hover:bg-primary/90 text-black font-black uppercase text-[11px] tracking-widest rounded-xl transition-all h-12 px-10 shadow-[0_0_20px_-5px_oklch(var(--primary)/0.4)]"
                        >
                            Next
                        </Button>
                    ) : (
                        <Button
                            type="submit"
                            disabled={
                                isPending ||
                                handleStatus === "taken" ||
                                handleStatus === "checking"
                            }
                            className="bg-primary hover:bg-primary/90 text-black font-black uppercase text-[11px] tracking-widest rounded-xl transition-all h-12 px-10 shadow-[0_0_20px_-5px_oklch(var(--primary)/0.4)]"
                        >
                            {isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Create Channel
                        </Button>
                    )}
                </div>
            </form>
        </Form>
    );
};

export default CreateChannelForm;
