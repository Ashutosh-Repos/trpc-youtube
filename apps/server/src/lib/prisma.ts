import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = global as unknown as {
    prisma?: PrismaClient;
    adapter?: PrismaPg;
};

const adapter =
    globalForPrisma.adapter ??
    new PrismaPg({
        connectionString: process.env.DATABASE_URL,
    });

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        log:
            process.env.NODE_ENV === "development"
                ? ["error", "warn"]
                : ["error"],
        adapter,
    });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
    globalForPrisma.adapter = adapter;
}

export default prisma;
