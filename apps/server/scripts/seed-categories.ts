import prisma from "../src/lib/prisma";

const categories = [
    { name: "Film & Animation", slug: "film-animation" },
    { name: "Autos & Vehicles", slug: "autos-vehicles" },
    { name: "Music", slug: "music" },
    { name: "Pets & Animals", slug: "pets-animals" },
    { name: "Sports", slug: "sports" },
    { name: "Travel & Events", slug: "travel-events" },
    { name: "Gaming", slug: "gaming" },
    { name: "People & Blogs", slug: "people-blogs" },
    { name: "Comedy", slug: "comedy" },
    { name: "Entertainment", slug: "entertainment" },
    { name: "News & Politics", slug: "news-politics" },
    { name: "Howto & Style", slug: "howto-style" },
    { name: "Education", slug: "education" },
    { name: "Science & Technology", slug: "science-technology" },
    { name: "Nonprofits & Activism", slug: "nonprofits-activism" },
];

async function main() {
    console.log("🌱 Seeding categories...");

    for (const category of categories) {
        await prisma.categories.upsert({
            where: { slug: category.slug },
            update: {},
            create: category,
        });
    }

    console.log("✅ Categories seeded successfully.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
