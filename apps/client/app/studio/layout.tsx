import { ModeToggle } from "@/components/theme-toogle";
import { TopBar } from "@/components/custom/TopBar";
import { StudioProvider } from "./_components/StudioProvider";
import { SwitchChannelButton } from "./_components/SwitchChannelButton";
import { NotificationBell } from "@/components/custom/notification-bell";

const StudioLayout = ({ children }: { children: React.ReactNode }) => {
    return (
        <StudioProvider>
            <div className="w-full h-screen flex flex-col overflow-hidden">
                <TopBar>
                    <div className="flex items-center gap-4">
                        <SwitchChannelButton />
                    </div>
                    <div className="flex items-center gap-2">
                        <NotificationBell />
                        <ModeToggle />
                    </div>
                </TopBar>
                <div className="w-full h-full flex flex-col-reverse sm:flex-row items-center justify-center overflow-hidden">
                    {children}
                </div>
            </div>
        </StudioProvider>
    );
};

export default StudioLayout;
