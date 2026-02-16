"use client";

import React, { useState, useRef } from "react";
import {
    motion,
    useTransform,
    AnimatePresence,
    useMotionValue,
    useSpring,
} from "motion/react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { PlusIcon } from "lucide-react";
import {
    Modal,
    ModalBody,
    ModalContent,
    useModal,
} from "@/components/ui/animated-modal";
import Image from "next/image";

export const AnimatedTooltip = ({
    items,
    imageClassName,
    addIcon,
    addComponent,
    onSelect,
}: {
    items: {
        id: number;
        originalId?: string;
        name: string;
        designation: string;
        image: string;
        href?: string;
    }[];
    imageClassName?: string;
    addIcon?: boolean;
    addComponent?: React.ReactNode;
    onSelect?: (id: string) => void;
}) => {
    return (
        <Modal>
            <TooltipContent
                items={items}
                imageClassName={imageClassName}
                addIcon={addIcon}
                addComponent={addComponent}
                onSelect={onSelect}
            />
        </Modal>
    );
};

const TooltipContent = ({
    items,
    imageClassName,
    addIcon,
    addComponent,
    onSelect,
}: {
    items: {
        id: number;
        originalId?: string;
        name: string;
        designation: string;
        image: string;
        href?: string;
    }[];
    imageClassName?: string;
    addIcon?: boolean;
    addComponent?: React.ReactNode;
    onSelect?: (id: string) => void;
}) => {
    const { setOpen } = useModal();
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const springConfig = { stiffness: 100, damping: 15 };
    const x = useMotionValue(0);
    const animationFrameRef = useRef<number | null>(null);

    const rotate = useSpring(
        useTransform(x, [-100, 100], [-45, 45]),
        springConfig,
    );
    const translateX = useSpring(
        useTransform(x, [-100, 100], [-50, 50]),
        springConfig,
    );

    const handleMouseMove = (event: any) => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }

        animationFrameRef.current = requestAnimationFrame(() => {
            const halfWidth = event.target.offsetWidth / 2;
            x.set(event.nativeEvent.offsetX - halfWidth);
        });
    };

    const allItems = addIcon
        ? [
              ...items,
              {
                  id: items.length,
                  name: "Add Channel",
                  designation: "Create a new channel",
                  image: "",
              },
          ]
        : items;

    return (
        <div className="flex flex-row items-center">
            {allItems.map((item, idx) => {
                const isAddIcon = addIcon && idx === allItems.length - 1;

                const Content = (
                    <div
                        className="group relative -mr-4"
                        key={item.id}
                        onMouseEnter={() => setHoveredIndex(item.id)}
                        onMouseLeave={() => setHoveredIndex(null)}
                    >
                        <AnimatePresence>
                            {hoveredIndex === item.id && (
                                <motion.div
                                    initial={{ opacity: 0, y: 20, scale: 0.6 }}
                                    animate={{
                                        opacity: 1,
                                        y: 0,
                                        scale: 1,
                                        transition: {
                                            type: "spring",
                                            stiffness: 260,
                                            damping: 10,
                                        },
                                    }}
                                    exit={{ opacity: 0, y: 20, scale: 0.6 }}
                                    style={{
                                        translateX: translateX,
                                        rotate: rotate,
                                        whiteSpace: "nowrap",
                                    }}
                                    className="absolute -top-16 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center justify-center rounded-md bg-black px-4 py-2 text-xs shadow-xl"
                                >
                                    <div className="absolute inset-x-10 -bottom-px z-30 h-px w-[20%] bg-linear-to-r from-transparent via-emerald-500 to-transparent" />
                                    <div className="absolute -bottom-px left-10 z-30 h-px w-[40%] bg-linear-to-r from-transparent via-sky-500 to-transparent" />
                                    <div className="relative z-30 text-base font-bold text-white">
                                        {item.name}
                                    </div>
                                    <div className="text-xs text-white">
                                        {item.designation}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        {isAddIcon ? (
                            <div
                                onMouseMove={handleMouseMove}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setOpen(true);
                                }}
                                className={cn(
                                    "relative m-0! h-12 w-12 rounded-full border-2 border-white bg-foreground text-background flex items-center justify-center p-0! transition duration-500 group-hover:z-30 group-hover:scale-105 cursor-pointer",
                                    imageClassName,
                                )}
                            >
                                <PlusIcon className="w-6 h-6" />
                            </div>
                        ) : item.image ? (
                            <Image
                                onMouseMove={handleMouseMove}
                                height={100}
                                width={100}
                                src={item.image}
                                alt={item.name}
                                onClick={() => {
                                    if (onSelect && item.originalId) {
                                        onSelect(item.originalId);
                                    }
                                }}
                                className={cn(
                                    "relative m-0! h-12 w-12 rounded-full border-2 border-white object-cover object-top p-0! transition duration-500 group-hover:z-30 group-hover:scale-105 cursor-pointer",
                                    imageClassName,
                                )}
                            />
                        ) : (
                            <div
                                onMouseMove={handleMouseMove}
                                onClick={() => {
                                    if (onSelect && item.originalId) {
                                        onSelect(item.originalId);
                                    }
                                }}
                                className={cn(
                                    "relative m-0! h-12 w-12 rounded-full border-2 border-white bg-neutral-800 text-white flex items-center justify-center font-bold text-lg p-0! transition duration-500 group-hover:z-30 group-hover:scale-105 cursor-pointer",
                                    imageClassName,
                                )}
                            >
                                {item.name.charAt(0).toUpperCase()}
                            </div>
                        )}
                    </div>
                );

                if (item.href && !onSelect) {
                    return (
                        <Link href={item.href} key={item.name}>
                            {Content}
                        </Link>
                    );
                }

                return Content;
            })}
            {addComponent && (
                <ModalBody>
                    <ModalContent>{addComponent}</ModalContent>
                </ModalBody>
            )}
        </div>
    );
};
