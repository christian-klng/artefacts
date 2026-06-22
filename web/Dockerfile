# syntax=docker/dockerfile:1

# ---- deps: install full node_modules (used by builder + migrator) ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- migrator: applies the schema to Postgres (one-shot compose service) ----
FROM node:24-alpine AS migrator
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["npm", "run", "db:push", "--", "--force"]

# ---- builder: compile the Next.js standalone output ----
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build-time placeholders; real values are injected at runtime by Coolify.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
ENV AUTH_SECRET=build-time-placeholder-secret-build-time-placeholder
RUN npm run build

# ---- runner: minimal runtime image ----
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
