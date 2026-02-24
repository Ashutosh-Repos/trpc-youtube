"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { setCookie, deleteCookie, getCookie } from "cookies-next";
import { useRouter } from "next/navigation";

interface StudioContextType {
    activeChannelId: string | null;
    setActiveChannel: (id: string) => void;
    clearActiveChannel: () => void;
}

const StudioContext = createContext<StudioContextType | undefined>(undefined);

export const StudioProvider = ({ children }: { children: React.ReactNode }) => {
    const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
    const router = useRouter();

    useEffect(() => {
        const savedId = getCookie("activeChannelId");
        if (savedId) {
            setTimeout(() => {
                setActiveChannelId(savedId as string);
            }, 0);
        }
    }, []);

    const setActiveChannel = (id: string) => {
        setActiveChannelId(id);
        setCookie("activeChannelId", id, { maxAge: 60 * 60 * 24 * 30 }); // 30 days
    };

    const clearActiveChannel = () => {
        setActiveChannelId(null);
        deleteCookie("activeChannelId");
        router.push("/studio/select");
    };

    return (
        <StudioContext.Provider
            value={{ activeChannelId, setActiveChannel, clearActiveChannel }}
        >
            {children}
        </StudioContext.Provider>
    );
};

export const useStudio = () => {
    const context = useContext(StudioContext);
    if (!context) {
        throw new Error("useStudio must be used within a StudioProvider");
    }
    return context;
};
