import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BellRing } from "lucide-react";

interface SubscribeButtonProps {
    isSubscribed: boolean;
    onClick: () => void;
    disabled?: boolean;
    className?: string;
    showIcon?: boolean;
}

export function SubscribeButton({
    isSubscribed,
    onClick,
    disabled,
    className,
    showIcon = true,
}: SubscribeButtonProps) {
    if (isSubscribed) {
        return (
            <Button
                variant="secondary"
                disabled={disabled}
                onClick={onClick}
                className={cn(
                    "rounded-full font-medium hover:bg-neutral-800",
                    className,
                )}
            >
                {showIcon && <BellRing className="w-4 h-4 mr-2" />}
                Subscribed
            </Button>
        );
    }

    return (
        <Button
            variant="default"
            disabled={disabled}
            onClick={onClick}
            className={cn(
                "rounded-full font-medium bg-white text-black hover:bg-neutral-200 hover:text-black",
                className,
            )}
        >
            Subscribe
        </Button>
    );
}
