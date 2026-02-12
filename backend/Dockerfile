# ---------- Builder ----------
FROM node:24-bookworm AS builder

WORKDIR /app

# Install build tools for native deps (e.g., bcrypt) and OpenSSL for Prisma
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 make g++ openssl \
  && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests first for better caching
COPY package*.json ./
COPY prisma ./prisma

# Install all deps (including dev) because Prisma CLI is in devDependencies
RUN npm ci

# Generate Prisma client (requires schema.prisma in ./prisma)
RUN npx prisma generate

# Remove devDependencies after generation
RUN npm prune --omit=dev

# Copy application source
COPY src ./src


# ---------- Runtime ----------
FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install OpenSSL for Prisma + curl for HEALTHCHECK
RUN apt-get update && apt-get install -y --no-install-recommends \
  openssl curl \
  && rm -rf /var/lib/apt/lists/*

# Copy production node_modules + app files from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/readyz || exit 1

CMD ["npm", "run", "start"]