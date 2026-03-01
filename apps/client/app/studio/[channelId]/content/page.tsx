import { redirect } from "next/navigation";

interface ContentPageProps {
    params: Promise<{
        channelId: string;
    }>;
}

export default async function ContentPage({ params }: ContentPageProps) {
    const { channelId } = await params;

    // Redirect cleanly to the default active tab
    redirect(`/studio/${channelId}/content/videos`);
}
