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
            className="flex items-center gap-2"
        >
            <LayoutGridIcon className="w-4 h-4" />
            <span>Switch Channel</span>
        </Button>
    );
};
