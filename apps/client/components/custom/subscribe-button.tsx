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
                    "rounded-full font-black tracking-tight bg-surface-2 hover:bg-surface-3 text-foreground/80 border border-border/40 px-6 transition-all duration-300 shadow-sm active:scale-95",
                    className,
                )}
            >
                {showIcon && (
                    <BellRing className="w-4 h-4 mr-2 text-primary drop-shadow-[0_0_8px_oklch(var(--primary)/0.4)]" />
                )}
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
                "rounded-full font-black tracking-tighter bg-foreground text-background hover:bg-foreground/90 px-8 transition-all duration-300 shadow-lg active:scale-95",
                className,
            )}
        >
            Subscribe
        </Button>
    );
}
