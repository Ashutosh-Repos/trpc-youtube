import { trpcServer } from "../../lib/trpc-server";

export const dynamic = "force-dynamic";

export default async function Home() {
    // data is fetched on the server during SSR
    const hello = await trpcServer.hello.query({ name: "Next.js Server" });

    return (
        <div className="flex h-screen w-full items-center justify-center flex-col gap-4">
            <h1 className="text-4xl font-bold">{hello.greeting}</h1>
            <p className="text-muted-foreground">
                Fetched via Server Component (RSC)
            </p>
        </div>
    );
}
