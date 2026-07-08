# syntax=docker/dockerfile:1

# Internal screenshot service. The official Playwright image bundles Chromium +
# all its system libraries + a base font set at a version that matches the
# `playwright` npm package we install (keep both pins in sync). This keeps the
# heavy browser runtime OUT of the `web` image — web just POSTs HTML here.
FROM mcr.microsoft.com/playwright:v1.55.0-jammy AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Only two deps (playwright + sharp); install without a lockfile for simplicity.
COPY package.json ./
RUN npm install --omit=dev

COPY server.mjs ./

# The Playwright image ships a non-root user with the browsers installed for it.
USER pwuser
EXPOSE 3000
CMD ["node", "server.mjs"]
