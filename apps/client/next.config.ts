import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: "standalone",
    async rewrites() {
        const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000";
        // Next.js rewrites require http/https. It automatically handles the WS upgrade.
        const httpUrl = wsUrl.replace(/^ws/, "http");
        return [
            {
                source: "/api/ws",
                destination: httpUrl,
            },
        ];
    },
    /* config options here */
    images: {
        unoptimized: true,
        remotePatterns: [
            {
                protocol: "https",
                hostname: "images.unsplash.com",
            },
            {
                protocol: "https",
                hostname: "lh3.googleusercontent.com",
            },
            {
                protocol: "http",
                hostname: "localhost",
                port: "9000",
            },
            {
                protocol: "https",
                hostname: "github.com",
            },
            {
                protocol: "https",
                hostname: "avatars.githubusercontent.com",
            },
            {
                protocol: "http",
                hostname: "localhost",
                port: "9000",
                pathname: "/**",
            },
            {
                protocol: "http",
                hostname: "127.0.0.1",
                port: "9000",
                pathname: "/**",
            },
            {
                protocol: "http",
                hostname: "192.168.1.43",
                port: "9000",
                pathname: "/**",
            },
            // Railway deployment — S3 Bucket public domain
            {
                protocol: "https",
                hostname: "**.up.railway.app",
                pathname: "/**",
            },
        ],
    },
};

export default nextConfig;
