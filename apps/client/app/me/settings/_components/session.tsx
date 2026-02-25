import { SessionList } from "./session-list";
import { auth } from "@/lib/auth/auth";
import { headers } from "next/headers";

export default async function SessionSection() {
    const headerDetails = await headers();
    const [sessions, currentSessionCtx] = await Promise.all([
        auth.api.listSessions({ headers: headerDetails }),
        auth.api.getSession({ headers: headerDetails }),
    ]);

    console.log(sessions);

    return (
        <div className="space-y-4 h-max max-w-6xl">
            <SessionList
                sessions={sessions}
                currentSessionId={
                    currentSessionCtx?.session.id ||
                    currentSessionCtx?.session.token
                }
            />
        </div>
    );
}
