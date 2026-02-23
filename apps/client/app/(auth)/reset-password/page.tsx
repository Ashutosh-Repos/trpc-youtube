"use client";

import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resetPasswordSchema } from "@/lib/auth/schemas";
import { z } from "zod";
import { useEffect, useTransition, Suspense } from "react";

import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { CardBody, CardContainer, CardItem } from "@/components/ui/3d-card";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/auth-client";
import { useRouter } from "next/navigation";

const ResetPasswordForm = () => {
    const [isPending, startTransition] = useTransition();
    const searchParams = useSearchParams();
    const token = searchParams.get("token");
    const router = useRouter();
    const form = useForm<z.infer<typeof resetPasswordSchema>>({
        resolver: zodResolver(resetPasswordSchema),
        defaultValues: {
            token: token || "",
            newPassword: "",
        },
        mode: "onChange",
    });

    // Update token value if it's missing initially but appears later
    useEffect(() => {
        if (token) {
            form.setValue("token", token);
        }
    }, [token, form]);

    const onSubmit = async (values: z.infer<typeof resetPasswordSchema>) => {
        startTransition(async () => {
            try {
                const result = await authClient.resetPassword(values);
                if (result.error) {
                    toast.error(result.error.message);
                } else {
                    toast.success(
                        "Password reset successfully! Please log in.",
                    );
                    router.replace("/login");
                }
            } catch (err) {
                toast.error("Internal server error");
            }
        });
    };

    if (!token) {
        return (
            <CardContainer className="inter-var w-max h-max p-6">
                <CardBody className="bg-transparent relative group/card md:p-10 p-6 rounded-xl w-max h-max md:w-lg">
                    <CardItem
                        translateZ="0"
                        className="absolute inset-0 w-full h-full backdrop-blur-[5px] rounded-xl -z-10"
                    >
                        <></>
                    </CardItem>
                    <CardItem
                        translateZ="50"
                        className="text-2xl font-black tracking-tighter uppercase text-destructive w-full flex items-center justify-center text-center"
                    >
                        Invalid or Missing Token
                    </CardItem>
                    <CardItem
                        as="p"
                        translateZ="60"
                        className="text-muted-foreground/40 text-[11px] font-black uppercase tracking-widest w-full text-center"
                    >
                        The password reset token is missing or has expired.
                    </CardItem>
                    <CardItem
                        translateZ="80"
                        className="w-full mt-8 flex justify-center"
                    >
                        <Link
                            href="/forgot-password"
                            className="px-6 py-2 rounded-xl bg-black dark:bg-white dark:text-black text-white text-xs font-bold"
                        >
                            Request New Link
                        </Link>
                    </CardItem>
                </CardBody>
            </CardContainer>
        );
    }

    return (
        <CardContainer className="inter-var w-max h-max p-6">
            <CardBody className="bg-transparent relative group/card md:p-10 p-6 rounded-xl w-max h-max md:w-lg">
                <CardItem
                    translateZ="0"
                    className="absolute inset-0 w-full h-full backdrop-blur-[5px] rounded-xl -z-10"
                >
                    <></>
                </CardItem>
                <div className="flex flex-col items-center justify-center mb-6">
                    <CardItem translateZ="50">
                        <div className="p-4 bg-primary/10 rounded-full mb-4 shadow-[0_0_20px_-5px_oklch(var(--primary)/0.2)]">
                            <ShieldCheck className="w-8 h-8 text-primary" />
                        </div>
                    </CardItem>
                    <CardItem
                        translateZ="60"
                        className="text-3xl font-black tracking-tighter uppercase text-foreground/90 w-full text-center"
                    >
                        Set New Password
                    </CardItem>
                    <CardItem
                        as="p"
                        translateZ="40"
                        className="text-muted-foreground/40 text-[10px] font-black uppercase tracking-[0.2em] mt-2 w-full text-center"
                    >
                        Please choose a strong password to protect your account.
                    </CardItem>
                </div>
                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(onSubmit)}
                        className="space-y-6"
                    >
                        <FormField
                            control={form.control}
                            name="token"
                            render={({ field }) => (
                                <input type="hidden" {...field} />
                            )}
                        />
                        <CardItem translateZ="100" className="w-full">
                            <FormField
                                control={form.control}
                                name="newPassword"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/60">
                                            New Password
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                type="password"
                                                placeholder="••••••••"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage className="text-destructive text-[10px] font-bold uppercase tracking-widest" />
                                    </FormItem>
                                )}
                            />
                        </CardItem>
                        <CardItem translateZ="150" className="w-full mt-4">
                            <div className="w-full h-max bg-transparent flex items-center justify-center pt-2">
                                <Button
                                    type="submit"
                                    disabled={isPending}
                                    className="w-full"
                                >
                                    {isPending ? (
                                        <div className="flex items-center space-x-2">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <span>Updating password...</span>
                                        </div>
                                    ) : (
                                        "Update Password"
                                    )}
                                </Button>
                            </div>
                        </CardItem>
                    </form>
                </Form>
            </CardBody>
        </CardContainer>
    );
};

const ResetPasswordPage = () => {
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center min-h-[400px]">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
            }
        >
            <ResetPasswordForm />
        </Suspense>
    );
};

export default ResetPasswordPage;
