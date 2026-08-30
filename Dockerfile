# Self-hosting image for Note.
#
# Note is a static-first browser app: the server it runs here only delivers
# HTML/JS/CSS, handles next-intl locale routing, and exposes the optional
# Bedrock/Vertex AI proxy routes. It never sees vault content or API keys —
# those stay in the user's browser and filesystem.
#
#   docker build -t note .
#   docker run --rm -p 3000:3000 note

# ---- deps ----------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ---------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `prebuild` regenerates public/docs-bundle from docs/, so the bundled
# first-launch vault is always in sync with the sources in this image.
RUN npm run build

# ---- runtime -------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs nextjs

# `output: 'standalone'` traces only the node_modules actually reachable at
# runtime, so the image stays small without a hand-maintained prune list.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
