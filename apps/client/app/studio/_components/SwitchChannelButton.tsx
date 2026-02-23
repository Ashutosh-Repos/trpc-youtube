"use client";

import { useStudio } from "./StudioProvider";
import { Button } from "@/components/ui/button";
import { LayoutGridIcon } from "lucide-react";
import { usePathname } from "next/navigation";

export const SwitchChannelButton = () => {
    const { clearActiveChannel, activeChannelId } = useStudio();
    const pathname = usePathname();

    // Only show if we have an active channel AND we are not on the checking/selection pages
    if (
        !activeChannelId ||
        pathname === "/studio" ||
        pathname === "/studio/select"
    )
        return null;

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={clearActiveChannel}
            className="flex items-center gap-2.5 h-10 px-4 rounded-xl hover:bg-surface-2 transition-all group border border-transparent hover:border-border/10"
        >
            <LayoutGridIcon className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
            <span className="text-[11px] font-black uppercase tracking-widest text-foreground/80">
                Switch Channel
            </span>
        </Button>
    );
};
