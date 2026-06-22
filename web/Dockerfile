# syntax=docker/dockerfile:1

# Debian/glibc base (not Alpine/musl): the Claude Agent SDK ships a native CLI
# binary built for glibc linux-x64, which is what it looks for at runtime.

# ---- deps: install full node_modules (used by builder + migrator) ----
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- migrator: applies the schema to Postgres (one-shot compose service) ----
FROM node:24-slim AS migrator
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["npm", "run", "db:push", "--", "--force"]

# ---- builder: compile the Next.js standalone output ----
FROM node:24-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build-time placeholders; real values are injected at runtime by Coolify.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
ENV AUTH_SECRET=build-time-placeholder-secret-build-time-placeholder
RUN npm run build

# ---- runner: minimal runtime image ----
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# The official node image already ships a non-root `node` user (uid 1000).
COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000
CMD ["node", "server.js"]
