import React from "react";
import Link from "next/link";
import { BackButton } from "./back-btn";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";

export interface NavItem {
    icon: React.ElementType;
    title: string;
    href: string;
}

export const SideNav = ({ navLinks }: { navLinks: NavItem[] }) => {
    return (
        <div className="sm:w-16 sm:h-full w-full h-12 bg-transparent flex flex-col items-center justify-center sm:p-2 gap-4 sm:py-4 overflow-visible ">
            {/* main nav */}
            <div className="w-full h-max sm:rounded-t-4xl sm:rounded-b-4xl bg-sidebar flex items-center justify-evenly sm:flex-col p-1 gap-1">
                {navLinks.map((item, idx) => {
                    const Icon = item.icon;

                    return (
                        <Link
                            href={item.href}
                            key={idx + item.title}
                            className="group flex items-center justify-center w-10 h-10 rounded-full bg-sidebar transition p-1.5 relative hover:scale-125 hover:translate-x-1/4"
                            title={item.title}
                        >
                            <Tooltip>
                                <TooltipTrigger>
                                    <Icon className="w-full h-full shrink-0 text-current" />
                                </TooltipTrigger>
                                <TooltipContent side="right">
                                    {item.title}
                                </TooltipContent>
                            </Tooltip>
                        </Link>
                    );
                })}
                {/* Back button */}
                <BackButton
                    className="group flex items-center justify-center w-10 h-10 rounded-full bg-sidebar transition p-1.5 relative hover:scale-125 hover:translate-x-1/4"
                    iconClassName="w-full h-full flex-shrink-0 text-current"
                    hoverDialog
                />
            </div>
        </div>
    );
};
