import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { WebSocketServer } from "ws";
import { appRouter } from "./router";
import { createWsContext } from "./context";

export function setupWs(wss: WebSocketServer) {
    const handler = applyWSSHandler({
        wss,
        router: appRouter,
        createContext: createWsContext,
    });

    console.log("🔌 tRPC WebSocket Server initialized");

    return {
        shutdown: () => {
            console.log("🔌 Shutting down tRPC WebSocket server...");
            handler.broadcastReconnectNotification();
            wss.close();
        },
    };
}
