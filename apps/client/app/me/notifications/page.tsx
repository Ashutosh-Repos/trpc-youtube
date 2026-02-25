import { getNotificationSettings } from "@/lib/actions/notification-settings";
import NotificationsClient from "./_components/notifications-client";

export const metadata = {
    title: "Notifications",
    description: "Manage your notifications and settings.",
};

interface NotificationSettingsType {
    newVideos: boolean;
    liveStreams: boolean;
    comments: boolean;
    replies: boolean;
    likes: boolean;
    subscribers: boolean;
}

export default async function NotificationsPage() {
    const response = await getNotificationSettings();

    // Provide a fallback if response fails, or default structure.
    const settings = response.success
        ? (response.data as NotificationSettingsType)
        : null;

    return <NotificationsClient initialSettings={settings} />;
}
