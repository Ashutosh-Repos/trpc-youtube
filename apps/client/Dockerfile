# ─── Stage 1: Install dependencies ───────────────────────────────────
FROM node:20-slim AS deps

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

# Copy workspace root manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy BOTH package.json files (server needed for workspace type imports)
COPY apps/client/package.json apps/client/package.json
COPY apps/server/package.json apps/server/package.json

# Install ALL dependencies (cached layer — only re-runs when manifests change)
RUN pnpm install --frozen-lockfile

# ─── Stage 2: Build ──────────────────────────────────────────────────
FROM deps AS builder

# ⚠️ CRITICAL: Next.js inlines NEXT_PUBLIC_* vars at BUILD time, not runtime.
# These MUST be available during `next build` or they'll be undefined in production.
# Railway passes service variables as Docker build args automatically.
ARG NEXT_PUBLIC_TRPC_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_PUBLIC_MINIO_URL
ARG NEXT_PUBLIC_MINIO_BUCKET
ARG NEXT_PUBLIC_TRANSCODER_URL

ENV NEXT_PUBLIC_TRPC_URL=$NEXT_PUBLIC_TRPC_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_PUBLIC_MINIO_URL=$NEXT_PUBLIC_PUBLIC_MINIO_URL
ENV NEXT_PUBLIC_MINIO_BUCKET=$NEXT_PUBLIC_MINIO_BUCKET
ENV NEXT_PUBLIC_TRANSCODER_URL=$NEXT_PUBLIC_TRANSCODER_URL

# Copy all source (server source needed for type imports via workspace:^)
COPY apps/client ./apps/client
COPY apps/server ./apps/server

# Re-run pnpm install to restore workspace symlinks destroyed by COPY
# (pnpm creates symlinks in apps/server/node_modules/ → node_modules/.pnpm/
#  but COPY overwrites apps/server/, destroying those symlinks)
# Fast (~2-5s) since packages are already cached in the pnpm store from deps stage.
RUN pnpm install --frozen-lockfile

# Generate Prisma client for both apps (client depends on server types)
RUN cd apps/server && npx prisma generate
RUN cd apps/client && npx prisma generate

# Build Next.js (produces standalone output in .next/standalone)
# NEXT_PUBLIC_* vars are baked into the bundle here
RUN cd apps/client && pnpm build

# ─── Stage 3: Production runtime ─────────────────────────────────────
FROM node:20-slim AS runner

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy standalone server (includes all bundled dependencies — no node_modules needed)
COPY --from=builder /app/apps/client/.next/standalone ./

# Copy static assets (not included in standalone)
COPY --from=builder /app/apps/client/.next/static ./apps/client/.next/static
COPY --from=builder /app/apps/client/public ./apps/client/public

EXPOSE 3000

# Standalone output runs from the monorepo root
CMD ["node", "apps/client/server.js"]
