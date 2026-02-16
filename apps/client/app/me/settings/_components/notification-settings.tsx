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
import { Mail, Bell } from "lucide-react";

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
        } catch (error) {
            // Revert
            setSettings((prev) => ({ ...prev, [key]: !newValue }));
            toast.error("Failed to update settings");
        }
    };

    return (
        <div className="space-y-6 bg-background w-full h-full">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Mail className="h-5 w-5" />
                        Channels
                    </CardTitle>
                    <CardDescription>
                        Choose how you want to be notified.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between space-x-2">
                        <Label
                            htmlFor="email-notifications"
                            className="flex flex-col space-y-1"
                        >
                            <span>Email Notifications</span>
                            <span className="font-normal text-xs text-muted-foreground">
                                Receive a digest of activity via email.
                            </span>
                        </Label>
                        <Switch
                            id="email-notifications"
                            checked={settings.emailEnabled}
                            onCheckedChange={() => handleToggle("emailEnabled")}
                        />
                    </div>
                    <div className="flex items-center justify-between space-x-2">
                        <Label
                            htmlFor="push-notifications"
                            className="flex flex-col space-y-1"
                        >
                            <span>Push Notifications</span>
                            <span className="font-normal text-xs text-muted-foreground">
                                Receive real-time push notifications on your
                                device.
                            </span>
                        </Label>
                        <Switch
                            id="push-notifications"
                            checked={settings.pushEnabled}
                            onCheckedChange={() => handleToggle("pushEnabled")}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Bell className="h-5 w-5" />
                        Activity
                    </CardTitle>
                    <CardDescription>
                        Select what you want to be notified about.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-6">
                        <div className="flex items-center justify-between space-x-2">
                            <Label htmlFor="new-videos">New Videos</Label>
                            <Switch
                                id="new-videos"
                                checked={settings.newVideos}
                                onCheckedChange={() =>
                                    handleToggle("newVideos")
                                }
                            />
                        </div>
                        <div className="flex items-center justify-between space-x-2">
                            <Label htmlFor="live-streams">Live Streams</Label>
                            <Switch
                                id="live-streams"
                                checked={settings.liveStreams}
                                onCheckedChange={() =>
                                    handleToggle("liveStreams")
                                }
                            />
                        </div>
                        <div className="flex items-center justify-between space-x-2">
                            <Label htmlFor="subscribers">New Subscribers</Label>
                            <Switch
                                id="subscribers"
                                checked={settings.subscribers}
                                onCheckedChange={() =>
                                    handleToggle("subscribers")
                                }
                            />
                        </div>
                        <div className="flex items-center justify-between space-x-2">
                            <Label htmlFor="comments">Comments</Label>
                            <Switch
                                id="comments"
                                checked={settings.comments}
                                onCheckedChange={() => handleToggle("comments")}
                            />
                        </div>
                        <div className="flex items-center justify-between space-x-2">
                            <Label htmlFor="replies">Replies</Label>
                            <Switch
                                id="replies"
                                checked={settings.replies}
                                onCheckedChange={() => handleToggle("replies")}
                            />
                        </div>
                        <div className="flex items-center justify-between space-x-2">
                            <Label htmlFor="mentions">Mentions</Label>
                            <Switch
                                id="mentions"
                                checked={settings.mentions}
                                onCheckedChange={() => handleToggle("mentions")}
                            />
                        </div>
                        <div className="flex items-center justify-between space-x-2">
                            <Label htmlFor="likes">Likes</Label>
                            <Switch
                                id="likes"
                                checked={settings.likes}
                                onCheckedChange={() => handleToggle("likes")}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
