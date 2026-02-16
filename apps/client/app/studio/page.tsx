import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const StudioPage = async () => {
    const cookieStore = await cookies();
    const activeChannelId = cookieStore.get("activeChannelId");

    if (activeChannelId) {
        redirect(`/studio/${activeChannelId.value}`);
    } else {
        redirect("/studio/select");
    }
};

export default StudioPage;
