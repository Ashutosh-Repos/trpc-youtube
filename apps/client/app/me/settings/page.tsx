import { ConnectedAccounts } from "./_components/connected-accounts";
import SessionSection from "./_components/session";
import { Security } from "./_components/security";
import { DeleteAccount } from "./_components/delete-account";
import { Tabs } from "@/components/ui/tabs";
import { getNotificationSettings } from "@/lib/actions/notification-settings";
import { NotificationSettings } from "./_components/notification-settings";
import { getUserAccounts } from "@/lib/actions/user";

export const metadata = {
    title: "Settings",
    description: "Manage your account settings and preferences.",
};

const SecurityTab = async () => {
    const response = await getUserAccounts();
    const accounts = response.success
        ? (response.data as {
              id: string;
              providerId: string;
              accountId: string;
          }[])
        : [];

    // Determine if user has a password set
    const hasPassword = accounts.some((acc) => acc.providerId === "credential");

    return (
        <div className="space-y-6 h-full w-full bg-background overflow-scroll">
            <ConnectedAccounts accounts={accounts} />
            {hasPassword && <Security hasPassword={true} />}
            <SessionSection />
            <DeleteAccount />
        </div>
    );
};

const NotificationTab = async () => {
    const response = await getNotificationSettings();
    if (!response.success) {
        return (
            <div className="p-4 text-center text-muted-foreground">
                Failed to load notification settings.
            </div>
        );
    }
    return <NotificationSettings settings={response.data} />;
};

const SettingsPage = async () => {
    const tabs = [
        {
            title: "Security",
            value: "security",
            content: <SecurityTab />,
        },
        {
            title: "Notifications",
            value: "notifications",
            content: <NotificationTab />,
        },
    ];
    return (
        <>
            <div className="flex flex-col gap-2 mb-4">
                <h1 className="text-3xl font-bold">Account Settings</h1>
                <p className="text-muted-foreground">
                    Manage your account security and connected devices.
                </p>
            </div>
            {/* <div className="perspective-[1000px] relative flex flex-col mx-auto w-full items-start justify-start border rounded-lg p-4"> */}
            <Tabs tabs={tabs} />
            {/* </div> */}
        </>
    );
};

export default SettingsPage;
