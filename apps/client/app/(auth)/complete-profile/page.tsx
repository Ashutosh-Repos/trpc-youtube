"use client";

import { SlotDatePicker } from "@/components/custom/slot-date-picker";
import { useState, useTransition } from "react";
import { format } from "date-fns";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { CardBody, CardContainer, CardItem } from "@/components/ui/3d-card";
import { authClient } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";

const CompleteProfileSchema = z.object({
    dob: z.date().max(new Date()),
});

const CompleteProfile = () => {
    const [isSuccess, setIsSuccess] = useState(false);
    const [date, setDate] = useState<Date>(new Date(2000, 0, 1));
    const [isPending, startTransition] = useTransition();

    const onSubmit = async () => {
        startTransition(async () => {
            try {
                const parsedData = CompleteProfileSchema.parse({ dob: date });
                const result = await authClient.updateUser(parsedData);
                if (result.error) {
                    toast.error(
                        result.error.message || "Failed to update profile",
                    );
                } else {
                    toast.success("Profile updated successfully!");
                    setIsSuccess(true);
                }
            } catch (err) {
                if (err instanceof z.ZodError) {
                    toast.error(err.issues[0].message);
                } else {
                    toast.error("Internal server error");
                }
            }
        });
    };

    return (
        <CardContainer className="inter-var w-max h-max p-6">
            <CardBody className="bg-transparent relative group/card md:p-10 p-6 rounded-xl w-max h-max md:w-lg space-y-10">
                <CardItem
                    translateZ="0"
                    className="absolute inset-0 w-full h-full backdrop-blur-[5px] rounded-xl -z-10"
                >
                    <></>
                </CardItem>
                <CardItem translateZ="80" className="w-full">
                    <h1 className="text-2xl font-bold text-center">
                        Select Your Birth Date
                    </h1>
                </CardItem>
                <CardItem translateZ="160" className="w-full">
                    <SlotDatePicker
                        date={date}
                        setDate={setDate}
                        fromYear={1900}
                        toYear={new Date().getFullYear()}
                    />
                </CardItem>
                <CardItem translateZ="60" className="w-full text-center">
                    <span className="text-sm font-bold font-stretch-50%">
                        {format(date, "PPP")}
                    </span>
                </CardItem>
                <CardItem translateZ="80" className="w-full">
                    <Button
                        onClick={onSubmit}
                        disabled={isPending}
                        className="w-full"
                    >
                        {isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Complete Profile
                    </Button>
                </CardItem>
            </CardBody>
        </CardContainer>
    );
};

export default CompleteProfile;
