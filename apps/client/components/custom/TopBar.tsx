export const TopBar = ({ children }: { children?: React.ReactNode }) => {
    return (
        <div className="w-full h-max flex items-center justify-between gap-2 p-2 bg-background backdrop-blur-sm relative z-50">
            <span className="text-2xl font-bold shrink-0">Play</span>
            <div className="flex items-center gap-2 flex-1 justify-end">
                {children}
            </div>
        </div>
    );
};
