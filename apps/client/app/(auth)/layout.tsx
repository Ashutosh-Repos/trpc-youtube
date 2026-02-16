import { ModeToggle } from "@/components/theme-toogle";
import { BackgroundLines } from "@/components/ui/background-lines";
import React from "react";

const AuthLayout = ({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) => {
    return (
        <BackgroundLines className="flex items-center justify-center flex-col px-4 w-screen h-screen">
            <div className="w-screen h-screen flex items-center justify-center">
                <div className="absolute top-2 right-2">
                    <ModeToggle />
                </div>
                {children}
            </div>
        </BackgroundLines>
    );
};

export default AuthLayout;
