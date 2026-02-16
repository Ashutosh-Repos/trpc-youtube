"use client";

import type { Variants, HTMLMotionProps } from "motion/react";
import { motion, useAnimation } from "motion/react";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";

export interface GoogleIconHandle {
    startAnimation: () => void;
    stopAnimation: () => void;
}

interface GoogleIconProps extends HTMLMotionProps<"div"> {
    size?: number;
}

const G_VARIANTS: Variants = {
    normal: {
        pathLength: 1,
        opacity: 1,
        transition: { duration: 0.3 },
    },
    draw: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: {
            duration: 0.6,
            ease: "easeInOut",
        },
    },
};

const GoogleIcon = forwardRef<GoogleIconHandle, GoogleIconProps>(
    ({ className, size = 18, ...props }, ref) => {
        const controls = useAnimation();
        const isControlledRef = useRef(false);

        useImperativeHandle(ref, () => {
            isControlledRef.current = true;

            return {
                startAnimation: () => {
                    controls.start("draw");
                },
                stopAnimation: () => {
                    controls.start("normal");
                },
            };
        });

        return (
            <motion.div
                className={cn("flex items-center", className)}
                {...props}
            >
                <svg
                    width={size}
                    height={size}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <motion.path
                        animate={controls}
                        initial="normal"
                        variants={G_VARIANTS}
                        d="
              M21 12
              a9 9 0 1 1 -2.64 -6.36
              M21 12
              h-9
            "
                    />
                </svg>
            </motion.div>
        );
    },
);

GoogleIcon.displayName = "GoogleIcon";
export { GoogleIcon };
