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
import { requestResetSchema } from "@/lib/auth/schemas";
import { z } from "zod";
import { useState, useTransition } from "react";
// import { requestPasswordResetAction } from "@/lib/actions/auth";
import { toast } from "sonner";
import { Loader2, MailCheck } from "lucide-react";
import { CardBody, CardContainer, CardItem } from "@/components/ui/3d-card";
import Link from "next/link";
import { authClient } from "@/lib/auth/auth-client";

const ForgotPasswordPage = () => {
    const [isSuccess, setIsSuccess] = useState(false);
    const [isPending, startTransition] = useTransition();

    const form = useForm<z.infer<typeof requestResetSchema>>({
        resolver: zodResolver(requestResetSchema),
        defaultValues: {
            email: "",
        },
        mode: "onChange",
    });

    const onSubmit = async (values: z.infer<typeof requestResetSchema>) => {
        startTransition(async () => {
            try {
                const result = await authClient.requestPasswordReset({
                    ...values,
                    redirectTo: "/reset-password",
                });
                if (result.error) {
                    toast.error(result.error.message);
                } else {
                    toast.success("Reset link sent! Please check your email.");
                    setIsSuccess(true);
                }
            } catch (err) {
                toast.error("Internal server error");
            }
        });
    };

    if (isSuccess) {
        return (
            <CardContainer className="inter-var w-max h-max p-6">
                <CardBody className="bg-transparent relative group/card md:p-10 p-6 rounded-xl w-max h-max md:w-lg">
                    <CardItem
                        translateZ="0"
                        className="absolute inset-0 w-full h-full backdrop-blur-[5px] rounded-xl -z-10"
                    >
                        <></>
                    </CardItem>
                    <div className="flex flex-col items-center justify-center space-y-4">
                        <CardItem translateZ="50">
                            <div className="p-3 bg-zinc-800 rounded-full">
                                <MailCheck className="w-8 h-8 text-white" />
                            </div>
                        </CardItem>
                        <CardItem
                            translateZ="60"
                            className="text-2xl font-bold text-zinc-600 dark:text-white w-full text-center"
                        >
                            Email Sent
                        </CardItem>
                        <CardItem
                            as="p"
                            translateZ="70"
                            className="text-zinc-500 text-sm dark:text-zinc-300 w-full text-center"
                        >
                            Check your inbox for a link to reset your password.
                        </CardItem>
                        <CardItem translateZ="80" className="w-full pt-4">
                            <Link
                                href="/login"
                                className="w-full flex justify-center py-2 rounded-xl bg-black dark:bg-white dark:text-black text-white text-xs font-bold"
                            >
                                Back to Login
                            </Link>
                        </CardItem>
                    </div>
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
                <CardItem
                    translateZ="50"
                    className="text-2xl font-bold text-zinc-600 dark:text-white w-full flex items-center justify-center"
                >
                    Forgot Password?
                </CardItem>
                <CardItem
                    as="p"
                    translateZ="20"
                    className="text-zinc-500 text-xs mt-2 dark:text-zinc-300 w-full flex items-center justify-center text-center"
                >
                    Don&apos;t worry! It happens. Please enter the email
                    associated with your account.
                </CardItem>
                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(onSubmit)}
                        className="space-y-6 mt-8"
                    >
                        <CardItem translateZ="100" className="w-full">
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-neutral-300">
                                            Email Address
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="john.doe@example.com"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage className="text-red-400 text-xs" />
                                    </FormItem>
                                )}
                            />
                        </CardItem>
                        <CardItem translateZ="150" className="w-full mt-4">
                            <div className="w-full h-max bg-transparent flex flex-col items-center justify-center space-y-4">
                                <Button
                                    type="submit"
                                    disabled={isPending}
                                    className="w-full"
                                >
                                    {isPending ? (
                                        <div className="flex items-center space-x-2">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <span>Sending link...</span>
                                        </div>
                                    ) : (
                                        "Send Reset Link"
                                    )}
                                </Button>
                                <Link
                                    href="/login"
                                    className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-white transition-colors"
                                >
                                    Remembered? Back to login
                                </Link>
                            </div>
                        </CardItem>
                    </form>
                </Form>
            </CardBody>
        </CardContainer>
    );
};

export default ForgotPasswordPage;
