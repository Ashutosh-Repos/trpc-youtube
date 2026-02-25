import { ConnectedAccounts } from "./_components/connected-accounts";
import SessionSection from "./_components/session";
import { Security } from "./_components/security";
import { DeleteAccount } from "./_components/delete-account";
import { getUserAccounts } from "@/lib/actions/user";

export const metadata = {
    title: "Settings",
    description: "Manage your account settings and preferences.",
};

const SettingsPage = async () => {
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
        <div className="flex flex-col gap-6 mx-auto py-8 px-4 w-full h-full">
            <div className="flex flex-col gap-2 mb-2">
                <h1 className="text-3xl font-black tracking-tight">
                    Account Settings
                </h1>
                <p className="text-sm text-muted-foreground font-medium">
                    Manage your account security, active sessions, and connected
                    devices.
                </p>
            </div>

            <div className="space-y-6 flex-1 overflow-y-auto scrollbar-hide pb-20">
                <ConnectedAccounts accounts={accounts} />
                {hasPassword && <Security hasPassword={true} />}
                <SessionSection />
                <DeleteAccount />
            </div>
        </div>
    );
};

export default SettingsPage;
