import "dotenv/config";
import prisma from "../lib/prisma";

const categories = [
    { name: "Film & Animation", slug: "film-animation", sortOrder: 1 },
    { name: "Autos & Vehicles", slug: "autos-vehicles", sortOrder: 2 },
    { name: "Music", slug: "music", sortOrder: 3 },
    { name: "Pets & Animals", slug: "pets-animals", sortOrder: 4 },
    { name: "Sports", slug: "sports", sortOrder: 5 },
    { name: "Travel & Events", slug: "travel-events", sortOrder: 6 },
    { name: "Gaming", slug: "gaming", sortOrder: 7 },
    { name: "People & Blogs", slug: "people-blogs", sortOrder: 8 },
    { name: "Comedy", slug: "comedy", sortOrder: 9 },
    { name: "Entertainment", slug: "entertainment", sortOrder: 10 },
    { name: "News & Politics", slug: "news-politics", sortOrder: 11 },
    { name: "Howto & Style", slug: "howto-style", sortOrder: 12 },
    { name: "Education", slug: "education", sortOrder: 13 },
    { name: "Science & Technology", slug: "science-technology", sortOrder: 14 },
    {
        name: "Nonprofits & Activism",
        slug: "nonprofits-activism",
        sortOrder: 15,
    },
];

async function main() {
    console.log("🌱 Seeding Categories...");
    for (const data of categories) {
        await prisma.categories.upsert({
            where: { slug: data.slug },
            update: {},
            create: data,
        });
        console.log(`✅ Upserted Category: ${data.name}`);
    }
    console.log("🚀 Finished seeding categories!");
}

main()
    .catch((e) => {
        console.error("❌ Failed to seed categories:");
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
