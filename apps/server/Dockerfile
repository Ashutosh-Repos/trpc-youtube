# ─── Stage 1: Install dependencies ───────────────────────────────────
FROM node:20-slim AS deps

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

# Copy workspace root manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy BOTH package.json files (client needed for workspace resolution)
COPY apps/server/package.json apps/server/package.json
COPY apps/client/package.json apps/client/package.json

# Install ALL dependencies (frozen lockfile for reproducibility)
RUN pnpm install --frozen-lockfile

# ─── Stage 2: Build ──────────────────────────────────────────────────
FROM node:20-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

# Copy everything from deps
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=deps /app/apps/client/node_modules ./apps/client/node_modules

# Copy source (both apps needed — client workspace ref for types)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server ./apps/server
COPY apps/client/package.json ./apps/client/package.json

# Generate Prisma client
RUN cd apps/server && npx prisma generate

# Build TypeScript
RUN cd apps/server && pnpm build

# ─── Stage 3: Production runtime ─────────────────────────────────────
FROM node:20-slim AS runner

# Install FFmpeg for video transcoding
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

# Copy workspace manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/client/package.json apps/client/package.json

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built output
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/generated ./apps/server/generated

# Copy Prisma schema (needed at runtime for Prisma Client)
COPY apps/server/prisma ./apps/server/prisma

# Create temp directory for transcoder
RUN mkdir -p /tmp/transcoder

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

WORKDIR /app/apps/server

# ─── Process Selection ────────────────────────────────────────────────
# Set START_CMD to choose which process to run:
#   start:api        → API server (default)
#   start:transcode  → Transcoding worker
#   start:services   → Background workers (engagement, scheduler, scoring)
#
# Railway: set START_CMD as a service variable for each service
ARG START_CMD=start:api
ENV START_CMD=$START_CMD

CMD ["sh", "-c", "pnpm $START_CMD"]
