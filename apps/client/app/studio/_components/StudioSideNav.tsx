import { SideNav, NavItem } from "@/components/custom/navigation/sidenav";
import { LayoutPanelTopIcon } from "@/components/ui/layout-panel-top";
import { YoutubeIcon } from "@/components/ui/youtube";
import { SparklesIcon } from "@/components/ui/sparkles";

export const StudioSideNav = ({ channelId }: { channelId: string }) => {
    const navItems: NavItem[] = [
        {
            icon: LayoutPanelTopIcon,
            title: "Dashboard",
            href: `/studio/${channelId}`,
        },
        {
            icon: YoutubeIcon,
            title: "Content",
            href: `/studio/${channelId}/content`,
        },
        {
            icon: SparklesIcon,
            title: "Settings",
            href: `/studio/${channelId}/settings`,
        },
    ];

    return <SideNav navLinks={navItems} />;
};
