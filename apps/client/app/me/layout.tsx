import { ModeToggle } from "@/components/theme-toogle";
import { TopBar } from "@/components/custom/TopBar";
import { SearchForm } from "@/components/custom/search-form";
import { NavItem, SideNav } from "@/components/custom/navigation/sidenav";
import { UserIcon } from "@/components/ui/user";
import { BellIcon } from "@/components/ui/bell";
import { HistoryIcon } from "@/components/ui/history";
import { CogIcon } from "@/components/ui/cog";

const MeLayout = ({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) => {
    const navItems: NavItem[] = [
        { icon: UserIcon, title: "Me", href: "/me" },
        {
            icon: HistoryIcon,
            title: "Watch History",
            href: "/me/watch-history",
        },
        {
            icon: BellIcon,
            title: "Notifications",
            href: "/me/notifications",
        },
        { icon: CogIcon, title: "Settings", href: "/me/settings" },
    ];
    return (
        <div className="w-full h-screen flex flex-col overflow-hidden">
            <TopBar>
                <SearchForm />
                <ModeToggle />
                <BellIcon
                    size={20}
                    className="border p-2 rounded-lg cursor-pointer"
                />
            </TopBar>
            <div className="w-full h-full flex flex-col-reverse sm:flex-row items-center justify-center overflow-hidden">
                <SideNav navLinks={navItems} />
                <div className="w-full h-full overflow-scroll rounded-md">
                    {children}
                </div>
            </div>
        </div>
    );
};
export default MeLayout;
