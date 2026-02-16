"use client";

import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { linkSocial, unlinkAccount } from "@/lib/auth/auth-client";
import { useRouter } from "next/navigation";
import { useState } from "react";
// We'll use simple SVGs for providers or lucide icons where appropriate.
// Github is in Lucide. Google is not, so we use a text label or custom SVG.
import { Github } from "lucide-react";

interface Account {
    id: string;
    providerId: string;
    accountId: string;
}

interface ConnectedAccountsProps {
    accounts: Account[];
}

export const ConnectedAccounts = ({ accounts }: ConnectedAccountsProps) => {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState<string | null>(null);

    const isConnected = (provider: string) =>
        accounts.some((acc) => acc.providerId === provider);

    const handleLink = async (provider: "google" | "github") => {
        setIsLoading(provider);
        try {
            await linkSocial({
                provider,
                callbackURL: "/me/settings",
            });
            // Redirect happens automatically
        } catch (error) {
            toast.error(`Failed to link ${provider}`);
            setIsLoading(null);
        }
    };

    const handleUnlink = async (provider: string) => {
        // Prevent unlinking if it's the only method?
        // Better-auth usually handles this safety check or returns error.
        setIsLoading(provider);
        try {
            await unlinkAccount({
                providerId: provider,
            });
            toast.success(`${provider} disconnected`);
            router.refresh();
        } catch (error) {
            toast.error(`Failed to disconnect ${provider}`);
        } finally {
            setIsLoading(null);
        }
    };

    return (
        <Card className="h-max py-4">
            <CardHeader>
                <CardTitle>Connected Accounts</CardTitle>
                <CardDescription>
                    Connect your accounts to log in faster.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Google */}
                <div className="flex items-center justify-between space-x-4 rounded-lg border p-4">
                    <div className="flex items-center space-x-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                            <span className="font-bold">G</span>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-medium leading-none">
                                Google
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {isConnected("google")
                                    ? "Connected"
                                    : "Connect your Google account"}
                            </p>
                        </div>
                    </div>
                    {isConnected("google") ? (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUnlink("google")}
                            disabled={isLoading === "google"}
                        >
                            {isLoading === "google" ? (
                                <Loader2 className="animate-spin" />
                            ) : (
                                "Disconnect"
                            )}
                        </Button>
                    ) : (
                        <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleLink("google")}
                            disabled={isLoading === "google"}
                        >
                            {isLoading === "google" ? (
                                <Loader2 className="animate-spin" />
                            ) : (
                                "Connect"
                            )}
                        </Button>
                    )}
                </div>

                {/* GitHub */}
                <div className="flex items-center justify-between space-x-4 rounded-lg border p-4">
                    <div className="flex items-center space-x-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                            <Github className="h-5 w-5" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-medium leading-none">
                                GitHub
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {isConnected("github")
                                    ? "Connected"
                                    : "Connect your GitHub account"}
                            </p>
                        </div>
                    </div>
                    {isConnected("github") ? (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUnlink("github")}
                            disabled={isLoading === "github"}
                        >
                            {isLoading === "github" ? (
                                <Loader2 className="animate-spin" />
                            ) : (
                                "Disconnect"
                            )}
                        </Button>
                    ) : (
                        <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleLink("github")}
                            disabled={isLoading === "github"}
                        >
                            {isLoading === "github" ? (
                                <Loader2 className="animate-spin" />
                            ) : (
                                "Connect"
                            )}
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};
