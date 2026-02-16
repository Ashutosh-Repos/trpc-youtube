import { SideNav, NavItem } from "@/components/custom/navigation/sidenav";
import { LayoutPanelTopIcon } from "@/components/ui/layout-panel-top";
import { YoutubeIcon } from "@/components/ui/youtube";
import { GalleryVerticalEndIcon } from "@/components/ui/gallery-vertical-end";
import { CogIcon } from "@/components/ui/cog";

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
            icon: GalleryVerticalEndIcon,
            title: "Playlists",
            href: `/studio/${channelId}/playlists`,
        },
        {
            icon: CogIcon,
            title: "Settings",
            href: `/studio/${channelId}/settings`,
        },
    ];

    return <SideNav navLinks={navItems} />;
};
