import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
    "/login",
    "/register",
    "/verify-email",
    "/forgot-password",
    "/reset-password",
    "/api/auth",
    "/api/webhooks",
];

const IGNORED_PATHS = ["/_next", "/favicon.ico", "/public", "/api/trpc"];

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 1. Skip ignored paths (Assets, Favicon)
    if ([...IGNORED_PATHS].some((path) => pathname.startsWith(path))) {
        return NextResponse.next();
    }

    // 2. Allow public paths without checking session
    if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
        return NextResponse.next();
    }

    // Fetch session from API (Node runtime) to avoid Edge Runtime issues with Prisma
    // Use localhost to avoid SSL issues — the public HTTPS URL resolves internally
    // to the container's HTTP port on Railway, causing ERR_SSL_WRONG_VERSION_NUMBER
    try {
        const internalOrigin = `http://localhost:${process.env.PORT || 3000}`;
        const res = await fetch(`${internalOrigin}/api/auth/get-session`, {
            headers: {
                cookie: request.headers.get("cookie") || "",
            },
        });
        const session = await res.json();

        if (!session?.user) {
            return NextResponse.redirect(new URL("/login", request.url));
        }

        if (
            !pathname.startsWith("/complete-profile") &&
            (session.user?.dob === null || session.user?.dob === undefined)
        ) {
            return NextResponse.redirect(
                new URL("/complete-profile", request.url),
            );
        }
    } catch (error) {
        console.error("Auth middleware error:", error);
        return NextResponse.redirect(new URL("/login", request.url));
    }

    return NextResponse.next();
}
