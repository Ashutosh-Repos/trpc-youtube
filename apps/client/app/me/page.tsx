import { trpcServer } from "@/lib/trpc-server";
import { redirect } from "next/navigation";
import Client from "./_components/client";

export default async function MePage() {
    let user;
    try {
        user = await trpcServer.user.getProfile.query();
    } catch {
        redirect("/login");
    }

    return <Client user={user} />;
}
