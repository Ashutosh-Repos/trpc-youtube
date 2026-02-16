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
import { loginSchema } from "@/lib/auth/schemas";
import { z } from "zod";
import { useRef, useTransition } from "react";

import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { CardBody, CardContainer, CardItem } from "@/components/ui/3d-card";
import Link from "next/link";
import { authClient } from "@/lib/auth/auth-client";
import { Separator } from "@/components/ui/separator";
import { GithubIcon, GithubIconHandle } from "@/components/ui/github";
import { cn } from "@/lib/utils";
import {
    GoogleIcon,
    type GoogleIconHandle,
} from "@/components/custom/google-icon";

const LoginPage = () => {
    const [isPending, startTransition] = useTransition();
    const form = useForm<z.infer<typeof loginSchema>>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: "",
            password: "",
        },
        mode: "onChange",
    });

    const onSubmit = async (values: z.infer<typeof loginSchema>) => {
        startTransition(async () => {
            try {
                const result = await authClient.signIn.email({
                    ...values,
                    callbackURL: "/",
                    rememberMe: true,
                });
                if (result.error) {
                    toast.error(result.error.message);
                } else {
                    toast.success("Logged in successfully!");
                }
            } catch (err) {
                // If it's a redirect, the browser will handle it
                if (!(err as any).digest?.startsWith("NEXT_REDIRECT")) {
                    toast.error("Internal server error");
                }
            }
        });
    };

    return (
        <CardContainer className="inter-var w-max h-max p-6">
            <CardBody className="bg-transparent relative group/card md:p-10 p-6 rounded-xl w-max h-max md:w-lg space-y-6">
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
                    Login to PlayTube
                </CardItem>
                <CardItem
                    as="p"
                    translateZ="20"
                    className="text-zinc-500 text-xs mt-2 dark:text-zinc-300 w-full flex items-center justify-center"
                >
                    Welcome back! Please enter your details
                </CardItem>
                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(onSubmit)}
                        className="space-y-5"
                    >
                        <CardItem translateZ="100" className="w-full mt-4">
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-neutral-300">
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
                                        <div className="flex items-center justify-between">
                                            <FormLabel className="text-neutral-300">
                                                Password
                                            </FormLabel>
                                            <Link
                                                href="/forgot-password"
                                                className="text-xs text-zinc-500 hover:text-white transition-colors"
                                            >
                                                Forgot?
                                            </Link>
                                        </div>
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

                        <CardItem translateZ="150" className="w-full mt-8">
                            <div className="w-full h-max bg-transparent flex items-center justify-center pt-2">
                                <Button
                                    type="submit"
                                    disabled={isPending}
                                    className="w-32"
                                >
                                    {isPending ? (
                                        <div className="flex items-center space-x-2">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <span>Logging in...</span>
                                        </div>
                                    ) : (
                                        "Login"
                                    )}
                                </Button>
                            </div>
                        </CardItem>
                    </form>
                </Form>
                <CardItem translateZ="40" className="w-full mt-4">
                    <div className="my-2 flex items-center gap-4">
                        <Separator className="flex-1 bg-zinc-200/20" />
                        <span className="text-xs text-muted-foreground">
                            OR CONTINUE WITH
                        </span>
                        <Separator className="flex-1 bg-zinc-200/20" />
                    </div>
                </CardItem>
                <CardItem
                    translateZ="80"
                    className="w-full mt-4 flex items-center justify-around gap-4"
                >
                    <GoogleSignIn className="w-32 md:w-48" />
                    <GithubSignIn className="w-32 md:w-48" />
                </CardItem>
                <CardItem
                    translateZ={100}
                    className="text-sm text-zinc-500 dark:text-zinc-400 w-full"
                >
                    <div className="flex justify-center items-center mt-6">
                        Don't have an account?{" "}
                        <Link
                            href="/register"
                            className="font-bold text-zinc-700 dark:text-zinc-200 hover:underline ml-1"
                        >
                            Sign up
                        </Link>
                    </div>
                </CardItem>
            </CardBody>
        </CardContainer>
    );
};

function GoogleSignIn({ className }: { className?: string }) {
    const iconRef = useRef<GoogleIconHandle>(null);

    const onClick = async () => {
        iconRef.current?.startAnimation();

        try {
            const result = await authClient.signIn.social({
                provider: "google",
                callbackURL: "/",
            });

            if (result?.error) {
                toast.error(result.error.message);
                iconRef.current?.stopAnimation();
            }
        } catch (err) {
            if (!(err as any)?.digest?.startsWith("NEXT_REDIRECT")) {
                toast.error("Internal server error");
                iconRef.current?.stopAnimation();
            }
        }
    };

    return (
        <Button
            variant="outline"
            className={cn(className)}
            onClick={onClick}
            onMouseEnter={() => iconRef.current?.startAnimation()}
            onMouseLeave={() => iconRef.current?.stopAnimation()}
        >
            <GoogleIcon ref={iconRef} />
            Google
        </Button>
    );
}

const GithubSignIn = ({ className }: { className?: string }) => {
    const iconRef = useRef<GithubIconHandle>(null);

    const onClick = async () => {
        iconRef.current?.startAnimation();
        try {
            const result = await authClient.signIn.social({
                provider: "github",
                callbackURL: "/",
            });

            if (result?.error) {
                toast.error(result.error.message);
                iconRef.current?.stopAnimation();
            }
        } catch (err) {
            if (!(err as any)?.digest?.startsWith("NEXT_REDIRECT")) {
                toast.error("Internal server error");
                iconRef.current?.stopAnimation();
            }
        }
    };

    return (
        <Button
            variant="outline"
            className={cn(className)}
            onClick={onClick}
            onMouseEnter={() => iconRef.current?.startAnimation()}
            onMouseLeave={() => iconRef.current?.stopAnimation()}
        >
            <GithubIcon ref={iconRef} />
            Github
        </Button>
    );
};

export default LoginPage;
