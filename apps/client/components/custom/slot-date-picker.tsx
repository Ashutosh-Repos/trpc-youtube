"use client";

import React, {
    useEffect,
    useRef,
    useState,
    useMemo,
    useCallback,
} from "react";
import {
    motion,
    useMotionValue,
    animate,
    useMotionValueEvent,
    useTransform,
    PanInfo,
    MotionValue,
} from "framer-motion";
import { cn } from "@/lib/utils";

interface SlotDatePickerProps {
    date?: Date;
    setDate: (date: Date) => void;
    fromYear?: number;
    toYear?: number;
}

const ITEM_HEIGHT = 30;
const CONTAINER_HEIGHT = 80;
const REEL_OFFSET = (CONTAINER_HEIGHT - ITEM_HEIGHT) / 2; // Exactly 120

export const SlotDatePicker: React.FC<SlotDatePickerProps> = ({
    date,
    setDate,
    fromYear = 1900,
    toYear = new Date().getFullYear(),
}) => {
    const [selectedDate, setSelectedDate] = useState<Date>(
        () => date || new Date(),
    );
    const dateRef = useRef<Date>(selectedDate);

    // Sync from prop
    useEffect(() => {
        if (
            date &&
            Math.abs(date.getTime() - dateRef.current.getTime()) > 1000
        ) {
            setSelectedDate(date);
            dateRef.current = date;
        }
    }, [date]);

    const months = useMemo(
        () => [
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December",
        ],
        [],
    );

    const years = useMemo(
        () =>
            Array.from({ length: toYear - fromYear + 1 }, (_, i: number) =>
                (fromYear + i).toString(),
            ).reverse(),
        [fromYear, toYear],
    );

    const currentYear = selectedDate.getFullYear();
    const currentMonth = selectedDate.getMonth();

    const days = useMemo(() => {
        const count = new Date(currentYear, currentMonth + 1, 0).getDate();
        return Array.from({ length: count }, (_, i: number) =>
            (i + 1).toString(),
        );
    }, [currentMonth, currentYear]);

    const handleUpdate = useCallback(
        (type: "month" | "day" | "year", value: number | string) => {
            const next = new Date(dateRef.current);
            if (type === "month") next.setMonth(value as number);
            else if (type === "day") next.setDate(value as number);
            else if (type === "year")
                next.setFullYear(parseInt(value as string));

            // Clamp day
            const maxDays = new Date(
                next.getFullYear(),
                next.getMonth() + 1,
                0,
            ).getDate();
            if (next.getDate() > maxDays) next.setDate(maxDays);

            if (next.getTime() !== dateRef.current.getTime()) {
                setSelectedDate(new Date(next));
                dateRef.current = new Date(next);
                setDate(new Date(next));
            }
        },
        [setDate],
    );

    return (
        <div className="relative flex h-20 w-max items-center justify-center gap-2 overflow-hidden perspective-distant">
            {/* Component Reels */}
            <SlotReel
                items={months}
                selectedValue={months[selectedDate.getMonth()]}
                onSelect={(idx) => handleUpdate("month", idx)}
                // width="w-32"
                width="sm:w-24 w-20"
            />

            <div className="h-20 w-[0.5px] bg-linear-to-b from-transparent via-foreground/40 to-transparent z-20" />

            <SlotReel
                items={days}
                selectedValue={selectedDate.getDate().toString()}
                onSelect={(idx) => handleUpdate("day", idx + 1)}
                // width="w-16"
                width="sm:w-24 w-20"
            />

            <div className="h-20 w-[0.5px] bg-linear-to-b from-transparent via-foreground/40 to-transparent z-20" />

            <SlotReel
                items={years}
                selectedValue={selectedDate.getFullYear().toString()}
                onSelect={(idx) => handleUpdate("year", years[idx])}
                width="sm:w-24 w-20"
            />
        </div>
    );
};

const SlotReel = React.memo(
    ({
        items,
        selectedValue,
        onSelect,
        width = "w-full",
    }: {
        items: string[];
        selectedValue: string;
        onSelect: (idx: number) => void;
        width?: string;
    }) => {
        const y = useMotionValue(REEL_OFFSET);
        const isInteracting = useRef(false);
        const [activeIndex, setActiveIndex] = useState(() =>
            Math.max(0, items.indexOf(selectedValue)),
        );

        useEffect(() => {
            if (!isInteracting.current) {
                const idx = items.indexOf(selectedValue);
                const target = -Math.max(0, idx) * ITEM_HEIGHT + REEL_OFFSET;
                animate(y, target, {
                    type: "spring",
                    stiffness: 300,
                    damping: 40,
                    mass: 0.8,
                });
            }
        }, [selectedValue, items, y]);

        useMotionValueEvent(y, "change", (val: number) => {
            const idx = Math.round((REEL_OFFSET - val) / ITEM_HEIGHT);
            const clampedIdx = Math.max(0, Math.min(idx, items.length - 1));
            if (clampedIdx !== activeIndex) {
                setActiveIndex(clampedIdx);
            }
        });

        const handleDragEnd = (
            _: MouseEvent | TouchEvent | PointerEvent,
            info: PanInfo,
        ) => {
            const power = 0.12;
            const target = y.get() + info.velocity.y * power;
            const snappedY =
                Math.round((target - REEL_OFFSET) / ITEM_HEIGHT) * ITEM_HEIGHT +
                REEL_OFFSET;
            const finalY = Math.max(
                -((items.length - 1) * ITEM_HEIGHT) + REEL_OFFSET,
                Math.min(REEL_OFFSET, snappedY),
            );

            const finalIndex = Math.round((REEL_OFFSET - finalY) / ITEM_HEIGHT);
            const clampedIndex = Math.max(
                0,
                Math.min(finalIndex, items.length - 1),
            );

            onSelect(clampedIndex);

            animate(y, finalY, {
                type: "spring",
                velocity: info.velocity.y,
                stiffness: 300,
                damping: 40,
                onComplete: () => {
                    isInteracting.current = false;
                },
            });
        };

        return (
            <div
                className={cn(
                    "relative h-full overflow-visible cursor-grab active:cursor-grabbing select-none z-10 flex flex-col items-center transform-3d transform-perspective-distant",
                    width,
                )}
                onPointerDown={() => {
                    isInteracting.current = true;
                }}
                onPointerUp={() => {
                    if (!y.isAnimating()) isInteracting.current = false;
                }}
            >
                {/* <div className="absolute -top-2 left-0.5 w-4 h-1/2 bg-sidebar rounded-tl-full rounded-bl-lg rotate-5"></div> */}
                <motion.div
                    drag="y"
                    dragConstraints={{
                        top: -((items.length - 1) * ITEM_HEIGHT) + REEL_OFFSET,
                        bottom: REEL_OFFSET,
                    }}
                    onDragStart={() => {
                        isInteracting.current = true;
                    }}
                    onDragEnd={handleDragEnd}
                    style={{ y }}
                    className="absolute top-0 w-full"
                >
                    {items.map((item: string, i: number) => (
                        <SlotItem
                            key={`${item}-${i}`}
                            item={item}
                            index={i}
                            y={y}
                            isActive={activeIndex === i}
                        />
                    ))}
                </motion.div>
            </div>
        );
    },
);

const SlotItem = ({
    item,
    index,
    y,
    isActive,
}: {
    item: string;
    index: number;
    y: MotionValue<number>;
    isActive: boolean;
}) => {
    const centerPos = REEL_OFFSET - index * ITEM_HEIGHT;
    const relativeY = useTransform(y, (latest: number) => latest - centerPos);

    const rotateX = useTransform(relativeY, [-140, 0, 140], [45, 0, -45]);
    const opacity = useTransform(
        relativeY,
        [-140, -60, 0, 60, 140],
        [0, 0.3, 1, 0.3, 0],
    );
    const scale = useTransform(relativeY, [-60, 0, 60], [0.8, 1, 0.8]);

    return (
        <motion.div
            style={{ rotateX, scale, opacity, height: ITEM_HEIGHT }}
            className={cn(
                "flex w-full items-center justify-center text-sm transition-colors duration-200",
                isActive
                    ? "text-foreground font-semibold"
                    : "text-foreground/20 font-medium",
            )}
        >
            {item}
        </motion.div>
    );
};

SlotReel.displayName = "SlotReel";
