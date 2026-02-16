"use client";

import { format } from "date-fns";

import { UAParser } from "ua-parser-js";
import { Laptop, Smartphone, Globe, Shield, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { revokeOtherSessions, revokeSession } from "@/lib/auth/auth-client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";

interface Session {
    id?: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    expiresAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
    token?: string;
}

interface SessionListProps {
    sessions: Session[];
    currentSessionId?: string;
}

export const SessionList = ({
    sessions,
    currentSessionId,
}: SessionListProps) => {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState<string | null>(null); // storing sessionId or 'all'

    const handleRevoke = async (sessionTokenOrId: string) => {
        setIsLoading(sessionTokenOrId);
        try {
            await revokeSession({
                token: sessionTokenOrId,
            });
            toast.success("Session revoked successfully");
            router.refresh();
        } catch (error) {
            toast.error("Failed to revoke session");
        } finally {
            setIsLoading(null);
        }
    };

    const handleRevokeAllOthers = async () => {
        setIsLoading("all");
        try {
            await revokeOtherSessions();
            toast.success("All other sessions signed out");
            router.refresh();
        } catch (error) {
            toast.error("Failed to sign out other sessions");
        } finally {
            setIsLoading(null);
        }
    };

    const getDeviceIcon = (deviceType?: string) => {
        if (deviceType === "mobile" || deviceType === "tablet") {
            return <Smartphone className="h-5 w-5" />;
        }
        return <Laptop className="h-5 w-5" />;
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Active Sessions</CardTitle>
                <CardDescription>
                    Manage devices where you are currently signed in.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {sessions.map((session, i) => {
                    const parser = new UAParser(session.userAgent || "");
                    const result = parser.getResult();
                    const sessionId =
                        session.id || session.token || `session-${i}`;
                    const isCurrent =
                        (session.id && session.id === currentSessionId) ||
                        (session.token && session.token === currentSessionId);

                    // Fallback names if parser fails
                    const browserName =
                        result.browser.name || "Unknown Browser";
                    const osName = result.os.name || "Unknown OS";
                    const deviceType = result.device.type;

                    return (
                        <div
                            key={sessionId}
                            className="flex items-center justify-between space-x-4 rounded-lg border p-4 transition-colors hover:bg-muted/50"
                        >
                            <div className="flex items-center space-x-4">
                                <div className="rounded-full bg-muted p-2">
                                    {getDeviceIcon(deviceType)}
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-medium leading-none">
                                            {browserName} on {osName}
                                        </p>
                                        {isCurrent && (
                                            <Badge
                                                variant="secondary"
                                                className="text-xs"
                                            >
                                                Current Session
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="flex items-center text-xs text-muted-foreground">
                                        <Globe className="mr-1 h-3 w-3" />
                                        {session.ipAddress || "Unknown IP"}
                                        <span className="mx-2">•</span>
                                        Last active:{" "}
                                        {format(
                                            new Date(session.updatedAt),
                                            "PP",
                                        )}
                                    </div>
                                </div>
                            </div>

                            {!isCurrent && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                        handleRevoke(
                                            session.token || session.id || "",
                                        )
                                    }
                                    disabled={
                                        isLoading ===
                                            (session.token || session.id) ||
                                        isLoading === "all"
                                    }
                                >
                                    {isLoading ===
                                    (session.token || session.id) ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        "Revoke"
                                    )}
                                </Button>
                            )}
                        </div>
                    );
                })}

                {sessions.length > 1 && (
                    <div className="flex justify-end pt-4">
                        <Button
                            variant="destructive"
                            onClick={handleRevokeAllOthers}
                            disabled={isLoading !== null}
                        >
                            {isLoading === "all" && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Sign out of all other devices
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
