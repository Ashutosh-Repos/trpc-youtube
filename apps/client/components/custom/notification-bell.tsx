"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/auth-client";
import {
    NotificationItem,
    type NotificationItemData,
} from "./notification-item";
import { toast } from "sonner";

const POPOVER_MAX_ITEMS = 7;

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
            staleTime: Infinity,
            refetchOnWindowFocus: false,
        });
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (serverUnreadCount !== undefined) {
            setUnreadCount(serverUnreadCount);
        }
    }, [serverUnreadCount]);

    // 3. Real-time Subscription (direct cache update + desktop toast)
    trpc.notification.onNotification.useSubscription(undefined, {
        onData(notification) {
            let wasUnread = false;
            let isUpdate = false;

            // Prepend/Update cache directly
            utils.notification.list.setInfiniteData(
                { limit: 10 },
                (old: any) => {
                    if (!old) return old;
                    // Remove existing if present to avoid duplicate keys when grouping
                    const newPages = old.pages.map((page: any) => ({
                        ...page,
                        items: page.items.filter((item: any) => {
                            if (item.id === notification.id) {
                                isUpdate = true;
                                if (!item.isRead) wasUnread = true;
                                return false;
                            }
                            return true;
                        }),
                    }));

                    const firstPage = newPages[0];
                    if (!firstPage) return old;

                    return {
                        ...old,
                        pages: [
                            {
                                ...firstPage,
                                items: [notification, ...firstPage.items],
                            },
                            ...newPages.slice(1),
                        ],
                    };
                },
            );

            // Only increment if it's a new notification, OR an update to a previously read notification
            if (!isUpdate || (isUpdate && !wasUnread)) {
                setUnreadCount((prev) => prev + 1);
            }

            // Desktop toast when bell is closed
            if (!isOpen) {
                const msg = (notification as any).title || "New notification";
                toast(msg, {
                    description: (notification as any).message,
                    action: (notification as any).actionUrl
                        ? {
                              label: "View",
                              onClick: () =>
                                  router.push((notification as any).actionUrl),
                          }
                        : undefined,
                    duration: 5000,
                });
            }
        },
        enabled: !!session?.user,
    });

    // 4. Mutations
    const markRead = trpc.notification.markRead.useMutation({
        onSuccess: () => {
            setUnreadCount((prev) => Math.max(0, prev - 1));
        },
    });

    const markAllRead = trpc.notification.markAllRead.useMutation({
        onSuccess: () => {
            setUnreadCount(0);
            utils.notification.list.setInfiniteData(
                { limit: 10 },
                (old: any) => {
                    if (!old) return old;
                    return {
                        ...old,
                        pages: old.pages.map((page: any) => ({
                            ...page,
                            items: page.items.map((item: any) => ({
                                ...item,
                                isRead: true,
                                readAt: new Date(),
                            })),
                        })),
                    };
                },
            );
            utils.notification.getUnreadCount.setData(undefined, 0);
        },
    });

    const deleteNotification = trpc.notification.delete.useMutation({
        onMutate: async ({ id }) => {
            // Optimistic removal from cache
            utils.notification.list.setInfiniteData(
                { limit: 10 },
                (old: any) => {
                    if (!old) return old;
                    return {
                        ...old,
                        pages: old.pages.map((page: any) => ({
                            ...page,
                            items: page.items.filter(
                                (item: any) => item.id !== id,
                            ),
                        })),
                    };
                },
            );
        },
    });

    const updateNotificationLevel =
        trpc.channel.updateNotificationLevel.useMutation();

    const notifications = data?.pages.flatMap((page) => page.items) || [];
    const popoverItems = notifications.slice(0, POPOVER_MAX_ITEMS);
    const hasMore = notifications.length > POPOVER_MAX_ITEMS || hasNextPage;

    const handleNotificationClick = (notification: NotificationItemData) => {
        if (!notification.isRead) {
            markRead.mutate({ id: notification.id });
            // Optimistic update
            utils.notification.list.setInfiniteData(
                { limit: 10 },
                (old: any) => {
                    if (!old) return old;
                    return {
                        ...old,
                        pages: old.pages.map((page: any) => ({
                            ...page,
                            items: page.items.map((item: any) =>
                                item.id === notification.id
                                    ? { ...item, isRead: true }
                                    : item,
                            ),
                        })),
                    };
                },
            );
        }
        setIsOpen(false);
        if (notification.actionUrl) {
            router.push(notification.actionUrl);
        }
    };

    const handleDelete = (id: string) => {
        deleteNotification.mutate({ id });
    };

    const handleTurnOffChannel = (channelId: string) => {
        updateNotificationLevel.mutate({ channelId, level: "NONE" });
        toast.success("Notifications turned off for this channel");
    };

    // Badge display: cap at 99+
    const badgeText = unreadCount > 99 ? "99+" : `${unreadCount}`;

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative hover:bg-surface-2 transition-colors rounded-full h-10 w-10"
                >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <span
                            className={cn(
                                "absolute -top-0.5 -right-0.5 rounded-full bg-primary ring-2 ring-background text-[10px] font-black text-primary-foreground flex items-center justify-center animate-in zoom-in duration-300 shadow-[0_0_10px_oklch(var(--primary)/0.4)]",
                                unreadCount > 99
                                    ? "h-5 min-w-5 px-1.5"
                                    : "h-4 w-4",
                            )}
                        >
                            {badgeText}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[380px] p-0 bg-surface-3/95 backdrop-blur-2xl border-border/40 shadow-2xl rounded-3xl overflow-hidden"
                align="end"
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/20">
                    <h4 className="font-black text-sm tracking-tight uppercase">
                        Notifications
                    </h4>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-3 text-[11px] font-black uppercase tracking-widest text-muted-foreground/60 hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                            onClick={() => markAllRead.mutate()}
                            disabled={markAllRead.isPending}
                        >
                            <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
                            Mark all read
                        </Button>
                    )}
                </div>
                <ScrollArea className="max-h-[380px]">
                    {popoverItems.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">
                                Your notifications live here
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            {popoverItems.map((notification: any) => (
                                <NotificationItem
                                    key={notification.id}
                                    notification={
                                        notification as NotificationItemData
                                    }
                                    onClick={handleNotificationClick}
                                    onDelete={handleDelete}
                                    onTurnOff={handleTurnOffChannel}
                                    compact
                                />
                            ))}
                        </div>
                    )}
                </ScrollArea>
                {/* "See all" footer */}
                {(hasMore || popoverItems.length > 0) && (
                    <div className="border-t border-border/20 p-2 bg-surface-2/50">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full h-10 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                            onClick={() => {
                                setIsOpen(false);
                                router.push("/notifications");
                            }}
                        >
                            See all notifications
                        </Button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}
