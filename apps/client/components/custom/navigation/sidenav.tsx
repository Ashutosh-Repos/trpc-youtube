"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BackButton } from "./back-btn";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface NavItem {
    icon: React.ElementType;
    title: string;
    href: string;
}

export const SideNav = ({ navLinks }: { navLinks: NavItem[] }) => {
    const pathname = usePathname();

    return (
        <aside className="sm:w-20 sm:h-full w-full h-16 bg-surface-1/60 backdrop-blur-2xl flex flex-col items-center justify-center sm:p-2 gap-4 sm:py-8 border-r border-border/40">
            {/* main nav */}
            <nav className="w-full h-max flex items-center justify-evenly sm:flex-col gap-3 p-1">
                {navLinks.map((item, idx) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;

                    return (
                        <Tooltip key={idx + item.title}>
                            <TooltipTrigger asChild>
                                <Link
                                    href={item.href}
                                    className={cn(
                                        "group flex items-center justify-center w-12 h-12 rounded-2xl transition-all duration-300 relative",
                                        isActive
                                            ? "bg-primary/20 text-primary shadow-[0_0_20px_-5px_oklch(var(--primary)/0.4)]"
                                            : "hover:bg-surface-2 text-muted-foreground/60 hover:text-foreground hover:scale-105 active:scale-95",
                                    )}
                                >
                                    <Icon
                                        className={cn(
                                            "w-5 h-5 shrink-0 transition-all duration-300",
                                            isActive
                                                ? "scale-110 drop-shadow-[0_0_8px_oklch(var(--primary)/0.6)]"
                                                : "",
                                        )}
                                    />
                                    {isActive && (
                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full sm:block hidden shadow-[0_0_15px_oklch(var(--primary)/0.8)]" />
                                    )}
                                </Link>
                            </TooltipTrigger>
                            <TooltipContent
                                side="right"
                                className="font-black text-[10px] uppercase tracking-[0.2em] bg-surface-3/90 backdrop-blur-xl border-border/20 text-foreground py-2 px-3 rounded-lg shadow-2xl"
                            >
                                {item.title}
                            </TooltipContent>
                        </Tooltip>
                    );
                })}

                <div className="h-px w-10 bg-border/40 sm:my-3 hidden sm:block" />

                {/* Back button */}
                <BackButton
                    className="flex items-center justify-center w-12 h-12 rounded-2xl transition-all hover:bg-surface-2 text-muted-foreground/60 hover:text-foreground hover:scale-105 active:scale-95"
                    iconClassName="w-5 h-5 flex-shrink-0"
                    hoverDialog
                />
            </nav>
        </aside>
    );
};
