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
        <article
            className={cn(
                "flex items-start gap-4 p-4 lg:p-5 rounded-xl transition-all duration-300 transform-gpu bg-surface-1/40 hover:bg-surface-2/60 border border-border/20 cursor-pointer group relative font-sans shadow-sm hover:shadow-md",
                !notification.isRead &&
                    "bg-primary/5 hover:bg-primary/10 border-primary/20",
            )}
            onClick={() => onClick?.(notification)}
        >
            {/* Unread Indicator Bar */}
            {!notification.isRead && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1/2 w-1 bg-primary rounded-r-max shadow-[0_0_8px_oklch(var(--primary)/0.6)]" />
            )}

            {/* Avatar: actor photo OR type icon */}
            <div className="relative shrink-0">
                {hasActor ? (
                    <Avatar className="h-12 w-12 border-2 border-background/50 shadow-sm transition-transform group-hover:scale-105">
                        <AvatarImage src={getMediaUrl(actor?.image)} />
                        <AvatarFallback className="bg-surface-3 font-semibold text-lg">
                            {actor?.name?.[0] || "?"}
                        </AvatarFallback>
                    </Avatar>
                ) : (
                    <div
                        className={cn(
                            "h-12 w-12 rounded-2xl flex items-center justify-center bg-surface-2 border border-border/40 transition-transform group-hover:scale-105 shadow-sm",
                            typeConfig?.color,
                        )}
                    >
                        {typeConfig ? (
                            <typeConfig.icon className="h-6 w-6" />
                        ) : (
                            <Bell className="h-6 w-6" />
                        )}
                    </div>
                )}
                {/* Secondary Type Icon overlay layout (optional aesthetic touch) */}
                {hasActor && typeConfig && (
                    <div
                        className={cn(
                            "absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-background flex items-center justify-center bg-surface-1 shadow-sm",
                            typeConfig.color,
                        )}
                    >
                        <typeConfig.icon className="h-3 w-3" />
                    </div>
                )}
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col gap-1.5 min-w-0 justify-center h-full pt-0.5">
                <p
                    className={cn(
                        "text-[15px] font-medium leading-snug text-foreground/90",
                        compact ? "line-clamp-2" : "line-clamp-3",
                    )}
                >
                    {displayName && (
                        <>
                            <span className="font-extrabold text-foreground">
                                {displayName}
                            </span>
                            {groupSuffix && (
                                <span className="text-muted-foreground font-semibold">
                                    {groupSuffix}
                                </span>
                            )}{" "}
                        </>
                    )}
                    {notification.message}
                </p>
                <time className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 group-hover:text-muted-foreground/80 transition-colors flex items-center gap-1.5">
                    {formatDistanceToNow(new Date(notification.createdAt), {
                        addSuffix: true,
                    })}
                </time>
            </div>

            {/* Right side: Thumbnail */}
            {notification.thumbnailUrl && (
                <div className="shrink-0 relative overflow-hidden rounded-lg ml-2 border border-border/20 shadow-sm transition-transform group-hover:scale-105">
                    <Image
                        src={getMediaUrl(notification.thumbnailUrl)}
                        alt=""
                        width={120}
                        height={68}
                        unoptimized
                        className="h-16 w-[114px] object-cover"
                    />
                </div>
            )}

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
        </article>
    );
}
