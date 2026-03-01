import { YoutubeIcon } from "../ui/youtube";
import { AtomIcon } from "../ui/atom";
import { WebhookIcon } from "../ui/web-hook";
import { BrainIcon } from "../ui/brain-icon";

import { RabbitIcon } from "../ui/rabbit";
import Link from "next/link";

export const TopBar = ({ children }: { children?: React.ReactNode }) => {
    return (
        <header className="w-full h-16 flex items-center justify-between gap-4 px-6 bg-surface-1/80 backdrop-blur-xl border-b border-border/40 sticky top-0 z-50 shadow-[0_1px_20px_-10px_oklch(var(--primary)/0.2)]">
            <Link
                href="/"
                prefetch={false}
                className="flex items-center gap-2 shrink-0 select-none group cursor-pointer"
            >
                <RabbitIcon />
                <span className="text-xl font-black tracking-tighter uppercase bg-linear-to-br from-foreground to-foreground/50 bg-clip-text text-transparent">
                    Bunly
                </span>
            </Link>

            <div className="flex items-center gap-2 flex-1 justify-end max-w-4xl mx-auto">
                {children}
            </div>
        </header>
    );
};
