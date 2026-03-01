import prisma from "./src/lib/prisma";

async function main() {
    console.log("Fetching processing videos...");
    const processing = await prisma.videos.findMany({
        where: {
            processingStatus: {
                not: "READY",
            },
        },
        select: {
            id: true,
            title: true,
            processingStatus: true,
            isShort: true,
            visibility: true,
            createdAt: true,
            deletedAt: true,
        },
    });

    console.log(`Found ${processing.length} processing videos:`, processing);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
