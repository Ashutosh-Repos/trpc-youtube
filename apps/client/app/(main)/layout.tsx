import { ModeToggle } from "@/components/theme-toogle";
import { TopBar } from "@/components/custom/TopBar";
import { SearchForm } from "@/components/custom/search-form";
import { NotificationBell } from "@/components/custom/notification-bell";
import { SideNav } from "@/components/custom/navigation/sidenav";
import { HomeIcon } from "@/components/ui/home";
import { FlameIcon } from "@/components/ui/flame";
import { ClapIcon } from "@/components/ui/clap";
import { CircleDollarSignIcon } from "@/components/ui/circle-dollar-sign";
import { UserIcon } from "@/components/ui/user";
const HomeLayout = ({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) => {
    const navItems = [
        { icon: HomeIcon, title: "Home", href: "/" },
        {
            icon: CircleDollarSignIcon,
            title: "Subscription",
            href: "/", // TODO: create /subscription page
        },
        { icon: FlameIcon, title: "Trending", href: "/trending" },
        { icon: ClapIcon, title: "Studio", href: "/studio" },
        { icon: UserIcon, title: "Me", href: "/me" },
    ];
    return (
        <main
            id="home-layout-wrapper"
            className="w-full h-screen flex flex-col overflow-hidden px-2 sm:px-1"
        >
            <TopBar>
                <SearchForm />
                <div className="flex items-center gap-2">
                    <NotificationBell />
                    <ModeToggle />
                </div>
                {/* <UserNav/> */}
            </TopBar>
            <div className="w-full h-full flex flex-col-reverse sm:flex-row items-center justify-center overflow-hidden">
                <SideNav navLinks={navItems} />
                <div
                    id="main-scroll-container"
                    className="w-full h-full overflow-y-auto p-2 sm:p-1"
                >
                    {children}
                </div>
            </div>
        </main>
    );
};
export default HomeLayout;
