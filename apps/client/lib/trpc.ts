import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@youtube/server/src/trpc/router";
import { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

export const trpc = createTRPCReact<AppRouter>();

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
