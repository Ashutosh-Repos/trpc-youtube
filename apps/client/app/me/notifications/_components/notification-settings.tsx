"use client";

import {
    updateNotificationSettings,
    NotificationSettingsType,
} from "@/lib/actions/notification-settings";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

interface NotificationFormProps {
    settings: NotificationSettingsType;
}

export function NotificationSettings({
    settings: initialSettings,
}: NotificationFormProps) {
    const [settings, setSettings] = useState(initialSettings);

    const handleToggle = async (key: keyof NotificationSettingsType) => {
        // Optimistic update
        const newValue = !settings[key];
        setSettings((prev) => ({ ...prev, [key]: newValue }));

        try {
            await updateNotificationSettings({ [key]: newValue });
            toast.success("Settings saved");
        } catch {
            // Revert
            setSettings((prev) => ({ ...prev, [key]: !newValue }));
            toast.error("Failed to update settings");
        }
    };

    return (
        <div className="w-full h-full">
            <Card className="bg-surface-1/40 border-border/20 shadow-sm overflow-hidden rounded-xl">
                <CardHeader className="border-b border-border/10 bg-surface-2/30 px-6 py-5">
                    <CardTitle className="flex items-center gap-2.5 text-lg font-black tracking-tight">
                        <Bell
                            className="h-5 w-5 text-primary"
                            strokeWidth={2.5}
                        />
                        Activity Preferences
                    </CardTitle>
                    <CardDescription className="text-sm font-medium mt-1">
                        Select which interactions trigger a notification in your
                        feed.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="flex flex-col">
                        {[
                            {
                                id: "newVideos",
                                label: "New Videos",
                                desc: "When channels you follow upload Content.",
                            },
                            {
                                id: "liveStreams",
                                label: "Live Streams",
                                desc: "When channels you follow go Live.",
                            },
                            {
                                id: "subscribers",
                                label: "New Subscribers",
                                desc: "When someone subscribes to your channel.",
                            },
                            {
                                id: "comments",
                                label: "Comments",
                                desc: "When someone comments on your videos.",
                            },
                            {
                                id: "replies",
                                label: "Replies",
                                desc: "When someone replies to your comments.",
                            },
                            {
                                id: "likes",
                                label: "Likes",
                                desc: "When someone likes your video or comment.",
                            },
                        ].map((item, idx) => (
                            <div
                                key={item.id}
                                className={cn(
                                    "flex items-center justify-between p-6 hover:bg-surface-2/40 transition-colors",
                                    idx !== 0 && "border-t border-border/10",
                                )}
                            >
                                <div className="flex flex-col gap-1 pr-6">
                                    <Label
                                        htmlFor={item.id}
                                        className="text-[15px] font-bold cursor-pointer"
                                    >
                                        {item.label}
                                    </Label>
                                    <p className="text-sm text-muted-foreground font-medium">
                                        {item.desc}
                                    </p>
                                </div>
                                <Switch
                                    id={item.id}
                                    checked={
                                        settings[
                                            item.id as keyof NotificationSettingsType
                                        ] as boolean
                                    }
                                    onCheckedChange={() =>
                                        handleToggle(
                                            item.id as keyof NotificationSettingsType,
                                        )
                                    }
                                    className="data-[state=checked]:bg-primary shrink-0"
                                />
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
