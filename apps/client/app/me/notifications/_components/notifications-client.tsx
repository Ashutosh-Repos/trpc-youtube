"use client";

import { useState } from "react";
import { Bell, CheckCheck, Settings } from "lucide-react";
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
import { NotificationSettings } from "./notification-settings";

const FILTER_TABS = [
    { key: "all", label: "All Activity" },
    { key: "uploads", label: "Uploads" },
    { key: "comments", label: "Mentions & Comments" },
] as const;

type FilterTab = (typeof FILTER_TABS)[number]["key"];

export default function NotificationsClient({
    initialSettings,
}: {
    initialSettings:
        | {
              newVideos: boolean;
              liveStreams: boolean;
              comments: boolean;
              replies: boolean;
              likes: boolean;
              subscribers: boolean;
          }
        | null
        | undefined;
}) {
    const [activeTab, setActiveTab] = useState<FilterTab>("all");
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const router = useRouter();
    const { data: session } = authClient.useSession();
    const utils = trpc.useUtils();

    const currentTypeFilter = activeTab === "all" ? undefined : activeTab;

    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
        trpc.notification.list.useInfiniteQuery(
            {
                limit: 20,
                typeFilter: currentTypeFilter,
            },
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
                {
                    limit: 20,
                    typeFilter: currentTypeFilter,
                },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (old: any) => {
                    if (!old) return old;
                    return {
                        ...old,
                        pages: old.pages.map(
                            (page: { items: { id: string }[] }) => ({
                                ...page,
                                items: page.items.filter(
                                    (item: { id: string }) => item.id !== id,
                                ),
                            }),
                        ),
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
                {
                    limit: 20,
                    typeFilter: currentTypeFilter,
                },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (old: any) => {
                    if (!old) return old;
                    return {
                        ...old,
                        pages: old.pages.map(
                            (page: {
                                items: { id: string; isRead: boolean }[];
                            }) => ({
                                ...page,
                                items: page.items.map(
                                    (item: { id: string; isRead: boolean }) =>
                                        item.id === notification.id
                                            ? { ...item, isRead: true }
                                            : item,
                                ),
                            }),
                        ),
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
        <section className="w-full mx-auto py-8 px-4 flex flex-col h-full overflow-hidden text-foreground border">
            {/* Header Area */}
            <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-8 shrink-0">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black tracking-tight">
                        Notifications
                    </h1>
                    <p className="text-sm text-muted-foreground font-medium">
                        {isSettingsOpen
                            ? "Configure your notification preferences."
                            : "Stay updated on interactions, uploads, and account changes."}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {!isSettingsOpen && (
                        <Button
                            variant="secondary"
                            size="sm"
                            className="rounded-full shadow-sm hover:shadow-md transition-all gap-2 self-start sm:self-auto font-bold tracking-tight text-xs"
                            onClick={() => markAllRead.mutate()}
                            disabled={markAllRead.isPending}
                        >
                            <CheckCheck className="h-4 w-4" />
                            Mark all as read
                        </Button>
                    )}
                    <Button
                        variant={isSettingsOpen ? "default" : "secondary"}
                        size="icon"
                        className="rounded-full shadow-sm hover:shadow-md transition-all shrink-0"
                        onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                        title="Notification Settings"
                    >
                        <Settings className="h-4 w-4" />
                    </Button>
                </div>
            </header>

            {/* Navigation Tabs */}
            {!isSettingsOpen && (
                <nav
                    aria-label="Notification filters"
                    className="flex gap-2 mb-6 border-b border-border/80 pb-4 p-2 overflow-x-auto scrollbar-hide shrink-0"
                >
                    {FILTER_TABS.map((tab) => {
                        const isActive = activeTab === tab.key;
                        return (
                            <Button
                                key={tab.key}
                                variant={isActive ? "default" : "secondary"}
                                size="sm"
                                className={cn(
                                    "rounded-full px-5 font-semibold transition-all shadow-sm shrink-0 text-xs tracking-tight",
                                    isActive
                                        ? "bg-foreground text-background shadow-md hover:bg-foreground/90 scale-105"
                                        : "bg-surface-2 hover:bg-surface-3 text-muted-foreground",
                                )}
                                onClick={() => setActiveTab(tab.key)}
                            >
                                {tab.label}
                            </Button>
                        );
                    })}
                </nav>
            )}

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto scrollbar-hide pb-20 relative rounded-xl">
                {isSettingsOpen ? (
                    initialSettings ? (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto">
                            <NotificationSettings settings={initialSettings} />
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-surface-1/50 rounded-xl border border-border/40 min-h-[400px]">
                            <p className="text-lg font-bold tracking-tight">
                                Settings Unavailable
                            </p>
                            <p className="text-sm">
                                Please refresh the page or try again later.
                            </p>
                        </div>
                    )
                ) : isLoading ? (
                    <div className="space-y-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div
                                key={i}
                                className="h-24 bg-surface-2/40 rounded-xl animate-pulse border border-border/10"
                            />
                        ))}
                    </div>
                ) : notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center bg-surface-1/30 rounded-2xl border border-dashed border-border/60">
                        <div className="h-20 w-20 rounded-full bg-surface-2 flex items-center justify-center mb-6 shadow-inner">
                            <Bell
                                className="h-10 w-10 text-muted-foreground/30"
                                strokeWidth={1.5}
                            />
                        </div>
                        <h3 className="text-xl font-black tracking-tight mb-2">
                            You&apos;re all caught up!
                        </h3>
                        <p className="text-sm text-muted-foreground max-w-[260px] mx-auto font-medium">
                            When people mention you, upload new videos, or
                            interact with your content, it will appear here.
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2 relative">
                        {notifications.map((notification, idx) => (
                            <div
                                key={notification.id}
                                className={cn(
                                    "animate-in fade-in slide-in-from-bottom-2 fill-mode-both",
                                )}
                                style={{
                                    animationDelay: `${idx * 50}ms`,
                                    animationDuration: "500ms",
                                }}
                            >
                                <NotificationItem
                                    notification={
                                        notification as unknown as NotificationItemData
                                    }
                                    onClick={handleNotificationClick}
                                    onDelete={handleDelete}
                                    onTurnOff={handleTurnOffChannel}
                                />
                            </div>
                        ))}

                        {hasNextPage && (
                            <div className="flex justify-center pt-8 pb-4">
                                <Button
                                    variant="secondary"
                                    onClick={() => fetchNextPage()}
                                    disabled={isFetchingNextPage}
                                    className="w-full max-w-[200px] rounded-full font-bold shadow-sm hover:shadow-md transition-all text-xs tracking-tight"
                                >
                                    {isFetchingNextPage
                                        ? "Loading more..."
                                        : "Load Older"}
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}
