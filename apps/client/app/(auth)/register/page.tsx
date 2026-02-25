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
import { registerSchema } from "@/lib/auth/schemas";
import { z } from "zod";
import { useEffect, useState, useTransition } from "react";

import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { CardBody, CardContainer, CardItem } from "@/components/ui/3d-card";
import Link from "next/link";
import { authClient } from "@/lib/auth/auth-client";
import { MailCheck } from "lucide-react";
import { ResendVerificationEmail } from "@/components/auth/resend-verification";

const RegisterPage = () => {
    const [isSuccess, setIsSuccess] = useState(false);
    const [isPending, startTransition] = useTransition();
    const form = useForm<z.infer<typeof registerSchema>>({
        resolver: zodResolver(registerSchema),
        defaultValues: {
            name: "",
            email: "",
            password: "",
        },
        mode: "onChange",
    });

    useEffect(() => {}, [isSuccess]);

    const onSubmit = async (values: z.infer<typeof registerSchema>) => {
        startTransition(async () => {
            try {
                const result = await authClient.signUp.email(values);
                if (result.error) {
                    toast.error(result.error.message);
                } else {
                    toast.success(
                        `
                        Registration successful! 
                        ${(<MailCheck />)}We have sent a verification link to your email address.
                        Please verify your email.
                        `,
                    );
                    setIsSuccess(true);
                }
            } catch {
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
                    <CardItem
                        translateZ="50"
                        className="text-2xl font-bold text-zinc-600 dark:text-white w-full flex items-center justify-center text-center"
                    >
                        Check your email
                    </CardItem>
                    <CardItem
                        as="p"
                        translateZ="60"
                        className="text-zinc-500 text-sm mt-4 dark:text-zinc-300 w-full text-center"
                    >
                        <MailCheck className="inline mr-2 h-4 w-4" />
                        We have sent a verification link to your email address.
                        <div className="mt-4 flex flex-col items-center gap-2">
                            <p className="text-xs text-muted-foreground/60">
                                Didn&apos;t receive the email?
                            </p>
                            <ResendVerificationEmail
                                email={form.getValues("email")}
                                variant="outline"
                                className="h-8 text-[10px] font-black uppercase tracking-widest"
                            />
                        </div>
                    </CardItem>
                    <CardItem
                        translateZ="80"
                        className="w-full mt-8 flex justify-center"
                    >
                        <Link
                            href="/login"
                            className="px-6 py-2 rounded-xl bg-black dark:bg-white dark:text-black text-white text-xs font-bold"
                        >
                            Back to Login
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
                <CardItem
                    translateZ="50"
                    className="text-3xl font-black tracking-tighter uppercase text-foreground/90 w-full flex items-center justify-center"
                >
                    Create Account
                </CardItem>
                <CardItem
                    as="p"
                    translateZ="20"
                    className="text-muted-foreground/40 text-[10px] font-black uppercase tracking-[0.2em] mt-2 w-full flex items-center justify-center"
                >
                    Enter your details to create a new account
                </CardItem>
                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(onSubmit)}
                        className="space-y-5"
                    >
                        <CardItem translateZ="60" className="w-full mt-4">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/60">
                                            Name
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="John Doe"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage className="text-red-400 text-xs" />
                                    </FormItem>
                                )}
                            />
                        </CardItem>
                        <CardItem translateZ="100" className="w-full mt-4">
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/60">
                                            Email
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
                        <CardItem translateZ="130" className="w-full mt-4">
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/60">
                                            Password
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                type="password"
                                                placeholder="••••••••"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage className="text-red-400 text-xs" />
                                    </FormItem>
                                )}
                            />
                        </CardItem>
                        {form.formState.errors.root && (
                            <div className="text-sm font-medium text-destructive">
                                {form.formState.errors.root.message}
                            </div>
                        )}
                        <CardItem translateZ="150" className="w-full mt-4">
                            <div className="w-full h-max bg-transparent flex items-center justify-center pt-2">
                                <Button type="submit" disabled={isPending}>
                                    {isPending ? (
                                        <div className="flex items-center space-x-2">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <span>Creating account...</span>
                                        </div>
                                    ) : (
                                        "Create account"
                                    )}
                                </Button>
                            </div>
                        </CardItem>
                    </form>
                </Form>
                <CardItem
                    translateZ={100}
                    className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/40 w-full"
                >
                    <div className="flex justify-center items-center mt-6">
                        Already have an account?{" "}
                        <Link
                            href="/login"
                            className="font-black text-foreground hover:text-primary ml-2 transition-colors"
                        >
                            Sign in
                        </Link>
                    </div>
                </CardItem>
            </CardBody>
        </CardContainer>
    );
};

export default RegisterPage;
