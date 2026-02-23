import { Zap } from "lucide-react";

export const TopBar = ({ children }: { children?: React.ReactNode }) => {
    return (
        <header className="w-full h-16 flex items-center justify-between gap-4 px-6 bg-surface-1/80 backdrop-blur-xl border-b border-border/40 sticky top-0 z-50 shadow-[0_1px_20px_-10px_oklch(var(--primary)/0.2)]">
            <div className="flex items-center gap-2 shrink-0 select-none group cursor-pointer">
                <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-[0_0_20px_-5px_oklch(var(--primary)/0.5)] transition-transform group-hover:scale-110 active:scale-95">
                    <Zap className="w-5 h-5 text-primary-foreground fill-current" />
                </div>
                <span className="text-xl font-black tracking-tighter uppercase bg-linear-to-br from-foreground to-foreground/50 bg-clip-text text-transparent">
                    Stream
                </span>
            </div>

            <div className="flex items-center gap-2 flex-1 justify-end max-w-4xl mx-auto">
                {children}
            </div>
        </header>
    );
};
