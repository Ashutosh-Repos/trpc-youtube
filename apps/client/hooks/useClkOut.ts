"use client";

import { RefObject, useEffect } from "react";

export const useClkOut = (
    ref: RefObject<HTMLElement | undefined | null>,
    callback: () => void,
    addEventListener = true,
) => {
    const handleClick = (event: MouseEvent) => {
        if (ref.current && !ref.current.contains(event.target as HTMLElement)) {
            callback();
        }
    };

    useEffect(() => {
        if (addEventListener) {
            document.addEventListener("click", handleClick);
        }

        return () => {
            document.removeEventListener("click", handleClick);
        };
    });
};
