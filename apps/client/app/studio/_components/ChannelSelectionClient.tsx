"use client";

import { AnimatedTooltip } from "@/components/ui/animated-tooltip";
import { useStudio } from "./StudioProvider";
import { useRouter } from "next/navigation";
import CreateChannelForm from "./channel-form";

interface Item {
    id: number;
    originalId?: string;
    name: string;
    designation: string;
    image: string;
    href?: string;
}

export const ChannelSelectionClient = ({ items }: { items: Item[] }) => {
    const { setActiveChannel } = useStudio();
    const router = useRouter();

    return (
        <AnimatedTooltip
            items={items}
            addIcon
            addComponent={<CreateChannelForm />}
            imageClassName="w-18 h-18"
            onSelect={(id) => {
                setActiveChannel(id);
                router.push(`/studio/${id}`);
            }}
        />
    );
};
