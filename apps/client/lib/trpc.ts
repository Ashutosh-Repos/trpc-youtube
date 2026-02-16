import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@youtube/server/src/trpc/router";

export const trpc = createTRPCReact<AppRouter>();
