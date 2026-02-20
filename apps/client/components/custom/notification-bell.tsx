"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCheck, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getMediaUrl, cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/auth-client";

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

export function NotificationBell() {
    const [isOpen, setIsOpen] = useState(false);
    const router = useRouter();
    const { data: session } = authClient.useSession();
    const utils = trpc.useUtils();

    // 1. Fetch Notifications (Infinite Query)
    const { data, fetchNextPage, hasNextPage } =
        trpc.notification.list.useInfiniteQuery(
            { limit: 10 },
            {
                getNextPageParam: (lastPage) => lastPage.nextCursor,
                enabled: !!session?.user,
            },
        );

    // 2. Persisted Unread Count (fetched from server once, real-time handles updates)
    const { data: serverUnreadCount } =
        trpc.notification.getUnreadCount.useQuery(undefined, {
            enabled: !!session?.user,
            staleTime: Infinity, // Only fetch once on mount
            refetchOnWindowFocus: false, // Real-time subscription handles updates
        });
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (serverUnreadCount !== undefined) {
            setUnreadCount(serverUnreadCount);
        }
    }, [serverUnreadCount]);

    // 3. Real-time Subscription (direct cache update instead of refetch)
    trpc.notification.onNotification.useSubscription(undefined, {
        onData(notification) {
            setUnreadCount((prev) => prev + 1);

            // Prepend to cache directly instead of refetching
            utils.notification.list.setInfiniteData({ limit: 10 }, (old) => {
                if (!old) return old;
                const firstPage = old.pages[0];
                if (!firstPage) return old;
                return {
                    ...old,
                    pages: [
                        {
                            ...firstPage,
                            items: [notification, ...firstPage.items],
                        },
                        ...old.pages.slice(1),
                    ],
                };
            });
        },
        enabled: !!session?.user,
    });

    // 4. Mark Read Mutations
    const markRead = trpc.notification.markRead.useMutation({
        onSuccess: () => {
            setUnreadCount((prev) => Math.max(0, prev - 1));
        },
    });

    const markAllRead = trpc.notification.markAllRead.useMutation({
        onSuccess: () => {
            setUnreadCount(0);
            // Update cached items to show as read
            utils.notification.list.setInfiniteData({ limit: 10 }, (old) => {
                if (!old) return old;
                return {
                    ...old,
                    pages: old.pages.map((page) => ({
                        ...page,
                        items: page.items.map((item) => ({
                            ...item,
                            isRead: true,
                            readAt: new Date().toISOString(),
                        })),
                    })),
                };
            });
            // Also invalidate the count query
            utils.notification.getUnreadCount.setData(undefined, 0);
        },
    });

    const notifications = data?.pages.flatMap((page) => page.items) || [];

    const handleNotificationClick = (notification: {
        id: string;
        isRead: boolean;
        actionUrl: string | null;
    }) => {
        // Mark as read if unread
        if (!notification.isRead) {
            markRead.mutate({ id: notification.id });

            // Optimistic update in cache
            utils.notification.list.setInfiniteData({ limit: 10 }, (old) => {
                if (!old) return old;
                return {
                    ...old,
                    pages: old.pages.map((page) => ({
                        ...page,
                        items: page.items.map((item) =>
                            item.id === notification.id
                                ? { ...item, isRead: true }
                                : item,
                        ),
                    })),
                };
            });
        }

        setIsOpen(false);
        if (notification.actionUrl) {
            router.push(notification.actionUrl);
        }
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 ring-2 ring-background text-[10px] font-bold text-white flex items-center justify-center">
                            {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
                <div className="flex items-center justify-between px-4 py-2 border-b">
                    <h4 className="font-semibold text-sm">Notifications</h4>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                            onClick={() => markAllRead.mutate()}
                            disabled={markAllRead.isPending}
                        >
                            <CheckCheck className="h-3.5 w-3.5" />
                            Mark all read
                        </Button>
                    )}
                </div>
                <ScrollArea className="h-[300px]">
                    {notifications.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground text-sm">
                            No notifications
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            {notifications.map((notification) => {
                                const actor =
                                    notification.user_notifications_actorIdTouser;
                                const typeConfig =
                                    NOTIFICATION_TYPE_CONFIG[notification.type];
                                const hasActor = !!actor;

                                // YouTube-style: channel name from enriched payload or message
                                const channelName = (notification as any)
                                    ._channelName;

                                return (
                                    <button
                                        key={notification.id}
                                        className={cn(
                                            "flex items-start gap-3 p-3 hover:bg-muted/50 text-left transition-colors border-b last:border-0",
                                            !notification.isRead &&
                                                "bg-primary/5 border-l-2 border-l-primary",
                                        )}
                                        onClick={() =>
                                            handleNotificationClick(
                                                notification,
                                            )
                                        }
                                    >
                                        {/* YouTube-style avatar: actor photo OR type icon */}
                                        {hasActor ? (
                                            <Avatar className="h-8 w-8 mt-1">
                                                <AvatarImage
                                                    src={getMediaUrl(
                                                        actor?.image,
                                                    )}
                                                />
                                                <AvatarFallback>
                                                    {actor?.name?.[0] || "?"}
                                                </AvatarFallback>
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
                                        <div className="flex-1 flex flex-col gap-1">
                                            <span className="text-sm font-medium line-clamp-2">
                                                {hasActor ? (
                                                    <>
                                                        <span className="font-bold">
                                                            {actor?.name}
                                                        </span>{" "}
                                                    </>
                                                ) : channelName ? (
                                                    <>
                                                        <span className="font-bold">
                                                            {channelName}
                                                        </span>{" "}
                                                    </>
                                                ) : null}
                                                {notification.message}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground">
                                                {formatDistanceToNow(
                                                    new Date(
                                                        notification.createdAt,
                                                    ),
                                                    { addSuffix: true },
                                                )}
                                            </span>
                                        </div>
                                        {/* Unread indicator dot */}
                                        {!notification.isRead && (
                                            <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-2" />
                                        )}
                                        {notification.thumbnailUrl && (
                                            <img
                                                src={getMediaUrl(
                                                    notification.thumbnailUrl,
                                                )}
                                                alt=""
                                                className="h-10 w-16 object-cover rounded"
                                            />
                                        )}
                                    </button>
                                );
                            })}
                            {hasNextPage && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => fetchNextPage()}
                                    className="m-2"
                                >
                                    Load more
                                </Button>
                            )}
                        </div>
                    )}
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
}
