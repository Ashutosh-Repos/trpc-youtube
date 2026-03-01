import { ContentTabsLayoutClient } from "./_components/layout-client";

interface ContentLayoutProps {
    children: React.ReactNode;
    params: Promise<{
        channelId: string;
    }>;
}

export default async function ContentLayout({
    children,
    params,
}: ContentLayoutProps) {
    const { channelId } = await params;
    return (
        <ContentTabsLayoutClient channelId={channelId}>
            {children}
        </ContentTabsLayoutClient>
    );
}
