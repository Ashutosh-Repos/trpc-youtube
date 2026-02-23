"use client";

import { Bell, BellOff, BellRing, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SubscriptionBellProps {
    channelId: string;
    isSubscribed: boolean;
}

const BELL_OPTIONS = [
    {
        level: "ALL" as const,
        icon: BellRing,
        label: "All",
        description: "Get every notification",
    },
    {
        level: "PERSONALIZED" as const,
        icon: Bell,
        label: "Personalized",
        description: "Only highlights",
    },
    {
        level: "NONE" as const,
        icon: BellOff,
        label: "None",
        description: "Don't notify me",
    },
];

export function SubscriptionBell({
    channelId,
    isSubscribed,
}: SubscriptionBellProps) {
    const { data: currentLevel, isLoading } =
        trpc.channel.getNotificationLevel.useQuery(
            { channelId },
            { enabled: isSubscribed },
        );

    const utils = trpc.useUtils();
    const updateLevel = trpc.channel.updateNotificationLevel.useMutation({
        onMutate: async ({ level }) => {
            // Optimistic update
            await utils.channel.getNotificationLevel.cancel({ channelId });
            const prev = utils.channel.getNotificationLevel.getData({
                channelId,
            });
            utils.channel.getNotificationLevel.setData({ channelId }, level);
            return { prev };
        },
        onError: (_err, _vars, ctx) => {
            if (ctx?.prev !== undefined) {
                utils.channel.getNotificationLevel.setData(
                    { channelId },
                    ctx.prev,
                );
            }
            toast.error("Failed to update notification level");
        },
        onSuccess: (_data, { level }) => {
            const option = BELL_OPTIONS.find((o: any) => o.level === level);
            toast.success(`Notifications: ${option?.label || level}`);
        },
    });

    if (!isSubscribed || isLoading) return null;

    const level = currentLevel ?? "PERSONALIZED";
    const current =
        BELL_OPTIONS.find((o: any) => o.level === level) || BELL_OPTIONS[1];
    const CurrentIcon = current.icon;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                >
                    <CurrentIcon
                        className={cn(
                            "h-4 w-4",
                            level === "NONE"
                                ? "text-muted-foreground"
                                : level === "ALL"
                                  ? "text-foreground"
                                  : "text-muted-foreground",
                        )}
                    />
                    <ChevronDown className="h-2.5 w-2.5 ml-0.5 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
                {BELL_OPTIONS.map((option: any) => {
                    const isActive = level === option.level;
                    return (
                        <DropdownMenuItem
                            key={option.level}
                            className={cn(
                                "flex items-center gap-3 py-2.5",
                                isActive && "bg-muted",
                            )}
                            onClick={() => {
                                if (!isActive) {
                                    updateLevel.mutate({
                                        channelId,
                                        level: option.level,
                                    });
                                }
                            }}
                        >
                            <option.icon className="h-4 w-4 shrink-0" />
                            <div className="flex flex-col">
                                <span className="text-sm font-medium">
                                    {option.label}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {option.description}
                                </span>
                            </div>
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
