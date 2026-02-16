import { router, publicProcedure } from "../trpc";
import prisma from "../../lib/prisma";

export const categoryRouter = router({
    getCategories: publicProcedure.query(async () => {
        const categories = await prisma.categories.findMany({
            orderBy: { name: "asc" },
        });
        return { success: true, categories };
    }),
});
