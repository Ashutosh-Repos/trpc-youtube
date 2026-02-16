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
import { CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { CardBody, CardContainer, CardItem } from "@/components/ui/3d-card";
import Link from "next/link";
import { authClient } from "@/lib/auth/auth-client";
import { MailCheck } from "lucide-react";

const RegisterPage = () => {
    const [isSuccess, setIsSuccess] = useState(false);
    const [isPending, startTransition] = useTransition();
    const form = useForm<z.infer<typeof registerSchema>>({
        resolver: zodResolver(registerSchema),
        defaultValues: {
            name: "",
            email: "",
            password: "",
            dob: undefined,
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
                    className="text-2xl font-bold text-zinc-600 dark:text-white w-full flex items-center justify-center"
                >
                    Create Account
                </CardItem>
                <CardItem
                    as="p"
                    translateZ="20"
                    className="text-zinc-500 text-xs mt-2 dark:text-zinc-300 w-full flex items-center justify-center"
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
                                        <FormLabel className="text-neutral-300">
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
                                        <FormLabel className="text-neutral-300">
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
                        <CardItem translateZ="110" className="w-max mt-4">
                            <FormField
                                control={form.control}
                                name="dob"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel className="text-neutral-300 mb-1">
                                            Date of birth
                                        </FormLabel>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <FormControl>
                                                    <Button variant={"outline"}>
                                                        {field.value ? (
                                                            format(
                                                                field.value,
                                                                "PPP",
                                                            )
                                                        ) : (
                                                            <span>
                                                                Pick a date
                                                            </span>
                                                        )}
                                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                    </Button>
                                                </FormControl>
                                            </PopoverTrigger>
                                            <PopoverContent
                                                className="w-auto p-0 bg-neutral-900 border-neutral-800"
                                                align="start"
                                            >
                                                <Calendar
                                                    mode="single"
                                                    selected={field.value}
                                                    onSelect={field.onChange}
                                                    disabled={(date) =>
                                                        date > new Date() ||
                                                        date <
                                                            new Date(
                                                                "1900-01-01",
                                                            )
                                                    }
                                                />
                                            </PopoverContent>
                                        </Popover>
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
                    className="text-sm text-zinc-500 dark:text-zinc-400 w-full"
                >
                    <div className="flex justify-center items-center mt-6">
                        Already have an account?{" "}
                        <Link
                            href="/login"
                            className="font-bold text-zinc-700 dark:text-zinc-200 hover:underline"
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
