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

/**
 * YouTube-style notification type icons.
 * Channel/system notifications have no actor — we show a type-specific icon instead.
 */
const NOTIFICATION_TYPE_CONFIG: Record<
    string,
    { icon: typeof Bell; color: string }
> = {
    NEW_VIDEO: { icon: PlayCircle, color: "text-red-500" },
    LIVE_STARTED: { icon: PlayCircle, color: "text-red-500" },
    LIVE_SCHEDULED: { icon: Bell, color: "text-blue-500" },
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
                "flex items-start gap-3 p-3 hover:bg-muted/50 text-left transition-colors border-b last:border-0 cursor-pointer group relative",
                !notification.isRead &&
                    "bg-primary/5 border-l-2 border-l-primary",
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
                        "h-8 w-8 mt-1 rounded-full flex items-center justify-center bg-muted shrink-0",
                        typeConfig?.color,
                    )}
                >
                    {typeConfig ? (
                        <typeConfig.icon className="h-4 w-4" />
                    ) : (
                        <Bell className="h-4 w-4" />
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
                <span className="text-[10px] text-muted-foreground">
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
                    <img
                        src={getMediaUrl(notification.thumbnailUrl)}
                        alt=""
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
