# syntax=docker/dockerfile:1

# Minimal standalone Next.js image for the marketing landing page. Mirrors the
# builder's Dockerfile (node:24-slim, standalone output) but has no DB, no
# migrator stage and no Agent SDK — it's a static, anonymous site.

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
# NEXT_PUBLIC_BUILDER_URL is baked in at build time (it's public). Override via
# Coolify build args / env for the real deployment.
ARG NEXT_PUBLIC_BUILDER_URL=https://app.kubikraum.digital
ENV NEXT_PUBLIC_BUILDER_URL=$NEXT_PUBLIC_BUILDER_URL
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
