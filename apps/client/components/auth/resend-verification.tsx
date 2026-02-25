"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface ResendVerificationEmailProps {
    email: string;
    variant?:
        | "default"
        | "outline"
        | "link"
        | "destructive"
        | "secondary"
        | "ghost";
    className?: string;
    onSuccess?: () => void;
}

export const ResendVerificationEmail = ({
    email,
    variant = "link",
    className,
    onSuccess,
}: ResendVerificationEmailProps) => {
    const [isPending, startTransition] = useTransition();

    const handleResend = () => {
        startTransition(async () => {
            try {
                const result = await authClient.sendVerificationEmail({
                    email,
                    callbackURL: "/",
                });

                if (result.error) {
                    toast.error(result.error.message);
                } else {
                    toast.success(
                        "Verification email sent! Please check your inbox.",
                    );
                    onSuccess?.();
                }
            } catch {
                toast.error("Failed to resend verification email.");
            }
        });
    };

    return (
        <Button
            variant={variant}
            className={className}
            disabled={isPending}
            onClick={handleResend}
            type="button"
        >
            {isPending ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resending...
                </>
            ) : (
                "Resend verification email"
            )}
        </Button>
    );
};
