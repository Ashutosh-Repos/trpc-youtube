"use client";

import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/auth-client";
import {
    NotificationItem,
    type NotificationItemData,
} from "@/components/custom/notification-item";
import { toast } from "sonner";

const FILTER_TABS = [
    { key: "all", label: "All" },
    { key: "uploads", label: "Uploads" },
    { key: "comments", label: "Comments" },
    { key: "activity", label: "Activity" },
] as const;

type FilterTab = (typeof FILTER_TABS)[number]["key"];

export default function NotificationsPage() {
    const [activeTab, setActiveTab] = useState<FilterTab>("all");
    const router = useRouter();
    const { data: session } = authClient.useSession();
    const utils = trpc.useUtils();

    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
        trpc.notification.list.useInfiniteQuery(
            { limit: 20, typeFilter: activeTab },
            {
                getNextPageParam: (lastPage) => lastPage.nextCursor,
                enabled: !!session?.user,
            },
        );

    const markAllRead = trpc.notification.markAllRead.useMutation({
        onSuccess: () => {
            utils.notification.list.invalidate();
            utils.notification.getUnreadCount.setData(undefined, 0);
            toast.success("All notifications marked as read");
        },
    });

    const markRead = trpc.notification.markRead.useMutation();

    const deleteNotification = trpc.notification.delete.useMutation({
        onMutate: async ({ id }) => {
            utils.notification.list.setInfiniteData(
                { limit: 20, typeFilter: activeTab },
                (old) => {
                    if (!old) return old;
                    return {
                        ...old,
                        pages: old.pages.map((page) => ({
                            ...page,
                            items: page.items.filter((item) => item.id !== id),
                        })),
                    };
                },
            );
        },
    });

    const updateNotificationLevel =
        trpc.channel.updateNotificationLevel.useMutation();

    const notifications = data?.pages.flatMap((page) => page.items) || [];

    const handleNotificationClick = (notification: NotificationItemData) => {
        if (!notification.isRead) {
            markRead.mutate({ id: notification.id });
            // Optimistic
            utils.notification.list.setInfiniteData(
                { limit: 20, typeFilter: activeTab },
                (old) => {
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
                },
            );
        }
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

    return (
        <div className="max-w-3xl mx-auto py-6 px-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">Notifications</h1>
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-sm text-muted-foreground hover:text-foreground gap-1.5"
                    onClick={() => markAllRead.mutate()}
                    disabled={markAllRead.isPending}
                >
                    <CheckCheck className="h-4 w-4" />
                    Mark all as read
                </Button>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 mb-4 border-b pb-2">
                {FILTER_TABS.map((tab) => (
                    <Button
                        key={tab.key}
                        variant={activeTab === tab.key ? "default" : "ghost"}
                        size="sm"
                        className={cn(
                            "rounded-full text-xs",
                            activeTab === tab.key &&
                                "bg-foreground text-background hover:bg-foreground/90",
                        )}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        {tab.label}
                    </Button>
                ))}
            </div>

            {/* Notification List */}
            {isLoading ? (
                <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div
                            key={i}
                            className="h-16 bg-muted/30 rounded animate-pulse"
                        />
                    ))}
                </div>
            ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <Bell className="h-12 w-12 mb-4 opacity-20" />
                    <p className="text-lg font-medium">
                        Your notifications live here
                    </p>
                    <p className="text-sm mt-1">
                        Subscribe to channels to get notified about new content
                    </p>
                </div>
            ) : (
                <>
                    <div className="rounded-lg border overflow-hidden">
                        {notifications.map((notification) => (
                            <NotificationItem
                                key={notification.id}
                                notification={
                                    notification as NotificationItemData
                                }
                                onClick={handleNotificationClick}
                                onDelete={handleDelete}
                                onTurnOff={handleTurnOffChannel}
                            />
                        ))}
                    </div>

                    {/* Load More */}
                    {hasNextPage && (
                        <div className="flex justify-center mt-6">
                            <Button
                                variant="outline"
                                onClick={() => fetchNextPage()}
                                disabled={isFetchingNextPage}
                                className="w-full max-w-xs"
                            >
                                {isFetchingNextPage
                                    ? "Loading..."
                                    : "Load more"}
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
