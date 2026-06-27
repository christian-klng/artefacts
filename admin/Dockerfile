# syntax=docker/dockerfile:1

# Minimal standalone Next.js image for the read-only admin panel. Mirrors the
# landing/builder Dockerfiles (node:24-slim, standalone output). It reads the
# builder's Postgres at runtime but has no migrator stage and no Agent SDK.

# ---- deps ----
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder ----
FROM node:24-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build-time placeholders; real values are injected at runtime by Coolify. The
# DB module throws if DATABASE_URL is unset at import, and a pool is only opened
# lazily on first query — so a placeholder is enough to build.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
ENV ADMIN_SECRET=build-time-placeholder-secret
RUN npm run build

# ---- runner ----
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000
CMD ["node", "server.js"]
