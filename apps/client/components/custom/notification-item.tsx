"use client";

import { Bell, PlayCircle, MoreVertical, Trash2, BellOff } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getMediaUrl, cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import Image from "next/image";

/**
 * YouTube-style notification type icons.
 * Channel/system notifications have no actor — we show a type-specific icon instead.
 */
const NOTIFICATION_TYPE_CONFIG: Record<
    string,
    { icon: typeof Bell; color: string }
> = {
    NEW_VIDEO: {
        icon: PlayCircle,
        color: "text-primary shadow-[0_0_12px_oklch(var(--primary)/0.3)]",
    },
    LIVE_STARTED: {
        icon: PlayCircle,
        color: "text-primary shadow-[0_0_12px_oklch(var(--primary)/0.3)]",
    },
    LIVE_SCHEDULED: {
        icon: Bell,
        color: "text-secondary-brand shadow-[0_0_12px_oklch(var(--secondary-brand)/0.3)]",
    },
    SYSTEM: { icon: Bell, color: "text-muted-foreground" },
};

export interface NotificationItemData {
    id: string;
    type: string;
    title: string;
    message: string;
    isRead: boolean;
    createdAt: string | Date;
    thumbnailUrl: string | null;
    actionUrl: string | null;
    channelId: string | null;
    groupCount: number;
    metadata: Record<string, unknown> | null;
    user_notifications_actorIdTouser: {
        id: string;
        name: string;
        image: string | null;
    } | null;
}

interface NotificationItemProps {
    notification: NotificationItemData;
    onClick?: (notification: NotificationItemData) => void;
    onDelete?: (id: string) => void;
    onTurnOff?: (channelId: string) => void;
    compact?: boolean; // true for popover, false for full page
}

export function NotificationItem({
    notification,
    onClick,
    onDelete,
    onTurnOff,
    compact = false,
}: NotificationItemProps) {
    const actor = notification.user_notifications_actorIdTouser;
    const typeConfig = NOTIFICATION_TYPE_CONFIG[notification.type];
    const hasActor = !!actor;
    const metadata = notification.metadata as Record<string, string> | null;
    const channelName = metadata?.channelName;
    const groupCount = notification.groupCount || 1;

    // Build display message with grouping
    const displayName = hasActor
        ? actor.name
        : channelName
          ? channelName
          : null;
    const groupSuffix =
        groupCount > 1
            ? ` and ${groupCount - 1} other${groupCount - 1 > 1 ? "s" : ""}`
            : "";

    return (
        <div
            className={cn(
                "flex items-start gap-4 p-4 hover:bg-surface-2/60 text-left transition-all duration-300 border-b border-border/10 last:border-0 cursor-pointer group relative font-sans",
                !notification.isRead &&
                    "bg-primary/5 border-l-[3px] border-l-primary",
            )}
            onClick={() => onClick?.(notification)}
        >
            {/* Avatar: actor photo OR type icon */}
            {hasActor ? (
                <Avatar className="h-8 w-8 mt-1 shrink-0">
                    <AvatarImage src={getMediaUrl(actor?.image)} />
                    <AvatarFallback>{actor?.name?.[0] || "?"}</AvatarFallback>
                </Avatar>
            ) : (
                <div
                    className={cn(
                        "h-10 w-10 mt-1 rounded-2xl flex items-center justify-center bg-surface-2 border border-border/40 shrink-0 transition-transform group-hover:scale-105 shadow-sm",
                        typeConfig?.color,
                    )}
                >
                    {typeConfig ? (
                        <typeConfig.icon className="h-5 w-5" />
                    ) : (
                        <Bell className="h-5 w-5" />
                    )}
                </div>
            )}

            {/* Content */}
            <div className="flex-1 flex flex-col gap-1 min-w-0">
                <span
                    className={cn(
                        "text-sm font-medium",
                        compact ? "line-clamp-2" : "line-clamp-3",
                    )}
                >
                    {displayName && (
                        <>
                            <span className="font-bold">{displayName}</span>
                            {groupSuffix && (
                                <span className="text-muted-foreground">
                                    {groupSuffix}
                                </span>
                            )}{" "}
                        </>
                    )}
                    {notification.message}
                </span>
                <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors">
                    {formatDistanceToNow(new Date(notification.createdAt), {
                        addSuffix: true,
                    })}
                </span>
            </div>

            {/* Right side: unread dot + thumbnail */}
            <div className="flex items-center gap-1.5 shrink-0">
                {!notification.isRead && (
                    <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                )}
                {notification.thumbnailUrl && (
                    <Image
                        src={getMediaUrl(notification.thumbnailUrl)}
                        alt=""
                        width={64}
                        height={40}
                        unoptimized
                        className="h-10 w-16 object-cover rounded"
                    />
                )}
            </div>

            {/* ⋮ Menu (appears on hover) */}
            {(onDelete || onTurnOff) && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        {onDelete && (
                            <DropdownMenuItem
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(notification.id);
                                }}
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Remove notification
                            </DropdownMenuItem>
                        )}
                        {onTurnOff && notification.channelId && (
                            <DropdownMenuItem
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onTurnOff(notification.channelId!);
                                }}
                            >
                                <BellOff className="h-4 w-4 mr-2" />
                                Turn off from channel
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
    );
}
